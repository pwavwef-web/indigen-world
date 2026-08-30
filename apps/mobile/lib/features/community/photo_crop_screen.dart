import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show compute;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:path_provider/path_provider.dart';

/// Crop a photo before it is posted.
///
/// Written against `dart:ui` rather than pulled in as a platform cropper: the
/// crop is one `drawImageRect` into a recorder, and doing it here keeps the
/// gesture, the frame and the export in one file that behaves identically on
/// both platforms and needs nothing added to a manifest.
///
/// Returns the path of a new JPEG in the temporary directory, or null if the
/// member backed out. The original file is never touched — a crop somebody
/// cancels halfway through has to leave their camera roll alone.
class PhotoCropScreen extends StatefulWidget {
  const PhotoCropScreen({required this.path, super.key});

  final String path;

  @override
  State<PhotoCropScreen> createState() => _PhotoCropScreenState();
}

/// The shapes on offer.
///
/// Four, not a slider. A ratio picker is a decision somebody makes in a second
/// or does not want to make at all, and free-form handles on a phone are a
/// fiddle — panning inside a fixed frame gets to the same crop faster.
enum _CropShape {
  original,
  square,
  portrait,
  landscape;

  String get label => switch (this) {
    _CropShape.original => 'Original',
    _CropShape.square => '1:1',
    _CropShape.portrait => '4:5',
    _CropShape.landscape => '16:9',
  };

  /// The frame's width ÷ height, or null to follow the photo's own shape.
  double? get ratio => switch (this) {
    _CropShape.original => null,
    _CropShape.square => 1,
    _CropShape.portrait => 4 / 5,
    _CropShape.landscape => 16 / 9,
  };
}

class _PhotoCropScreenState extends State<PhotoCropScreen> {
  /// The photo as loaded, before any rotation.
  ui.Image? _source;

  /// The photo after quarter turns — what every measurement below is against.
  ui.Image? _image;

  Object? _loadFailure;
  var _quarterTurns = 0;
  var _shape = _CropShape.original;
  var _working = false;

  /// How far in, as a multiple of the "cover the frame" scale. Never below 1:
  /// the frame must stay filled, or a crop would carry blank corners.
  var _zoom = 1.0;

  /// How far the photo has been dragged from centred, in frame pixels.
  var _pan = Offset.zero;

  static const _maxZoom = 6.0;

  /// Longest edge of the exported file, matching the picker's own ceiling so a
  /// cropped photo is never heavier than an uncropped one.
  static const _maxOutputEdge = 1920;

  static const _quality = 88;

  // Gesture anchors, captured when the fingers land.
  var _gestureZoom = 1.0;
  var _gesturePan = Offset.zero;
  var _gestureFocal = Offset.zero;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _source?.dispose();
    if (!identical(_source, _image)) _image?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final bytes = await File(widget.path).readAsBytes();
      final image = await decodeImageFromList(bytes);
      if (!mounted) {
        image.dispose();
        return;
      }
      setState(() {
        _source = image;
        _image = image;
      });
    } on Object catch (error) {
      if (mounted) setState(() => _loadFailure = error);
    }
  }

  // ── Geometry ─────────────────────────────────────────────────────────────

  /// The crop frame inside [available], as large as it will go.
  Size _frameFor(Size available, ui.Image image) {
    final ratio = _shape.ratio ?? image.width / image.height;
    final width = math.min(available.width, available.height * ratio);
    return Size(width, width / ratio);
  }

  /// The scale at which the photo exactly covers [frame].
  double _baseScale(Size frame, ui.Image image) => math.max(
    frame.width / image.width,
    frame.height / image.height,
  );

  /// Keeps the photo covering the frame, whatever the drag tried to do.
  Offset _clampPan(Offset pan, Size frame, Size displayed) {
    final slackX = math.max(0.0, (displayed.width - frame.width) / 2);
    final slackY = math.max(0.0, (displayed.height - frame.height) / 2);
    return Offset(
      pan.dx.clamp(-slackX, slackX),
      pan.dy.clamp(-slackY, slackY),
    );
  }

  Size _displayedSize(Size frame, ui.Image image) {
    final scale = _baseScale(frame, image) * _zoom;
    return Size(image.width * scale, image.height * scale);
  }

  /// The part of the photo, in its own pixels, that the frame is showing.
  Rect _sourceRect(Size frame, ui.Image image) {
    final scale = _baseScale(frame, image) * _zoom;
    final displayed = _displayedSize(frame, image);
    // Where the frame's top-left lands inside the drawn photo.
    final left = (displayed.width - frame.width) / 2 - _pan.dx;
    final top = (displayed.height - frame.height) / 2 - _pan.dy;
    return Rect.fromLTWH(
      (left / scale).clamp(0.0, image.width.toDouble()),
      (top / scale).clamp(0.0, image.height.toDouble()),
      math.min(frame.width / scale, image.width.toDouble()),
      math.min(frame.height / scale, image.height.toDouble()),
    );
  }

  // ── Gestures ─────────────────────────────────────────────────────────────

  void _onScaleStart(ScaleStartDetails details) {
    _gestureZoom = _zoom;
    _gesturePan = _pan;
    _gestureFocal = details.localFocalPoint;
  }

  void _onScaleUpdate(ScaleUpdateDetails details, Size frame, ui.Image image) {
    final base = _baseScale(frame, image);
    final zoom = (_gestureZoom * details.scale).clamp(1.0, _maxZoom);

    // The pixel of the photo under the fingers when they landed stays under
    // them, which is the whole difference between a zoom that feels attached
    // to the picture and one that feels like a slider somewhere else.
    final startScale = base * _gestureZoom;
    final startSize = Size(
      image.width * startScale,
      image.height * startScale,
    );
    final centre = Offset(frame.width / 2, frame.height / 2);
    final startTopLeft =
        centre + _gesturePan - Offset(startSize.width, startSize.height) / 2;
    final anchor = (_gestureFocal - startTopLeft) / startScale;

    final scale = base * zoom;
    final size = Size(image.width * scale, image.height * scale);
    final pan =
        details.localFocalPoint -
        anchor * scale -
        centre +
        Offset(size.width, size.height) / 2;

    setState(() {
      _zoom = zoom;
      _pan = _clampPan(pan, frame, size);
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  Future<void> _rotate() async {
    final source = _source;
    if (source == null || _working) return;
    HapticFeedback.selectionClick();
    final turns = (_quarterTurns + 1) % 4;
    final rotated = await _rotatedCopy(source, turns);
    if (!mounted) {
      if (!identical(rotated, source)) rotated.dispose();
      return;
    }
    final previous = _image;
    setState(() {
      _quarterTurns = turns;
      _image = rotated;
      _reset();
    });
    if (previous != null && !identical(previous, source)) previous.dispose();
  }

  void _reset() {
    _zoom = 1;
    _pan = Offset.zero;
  }

  /// [source] turned through [quarterTurns] right angles.
  static Future<ui.Image> _rotatedCopy(ui.Image source, int quarterTurns) {
    final turns = quarterTurns % 4;
    if (turns == 0) return Future.value(source);
    final width = source.width;
    final height = source.height;
    final outWidth = turns.isOdd ? height : width;
    final outHeight = turns.isOdd ? width : height;

    final recorder = ui.PictureRecorder();
    Canvas(recorder)
      ..translate(outWidth / 2, outHeight / 2)
      ..rotate(turns * math.pi / 2)
      ..translate(-width / 2, -height / 2)
      ..drawImage(
        source,
        Offset.zero,
        Paint()..filterQuality = FilterQuality.high,
      );
    return recorder.endRecording().toImage(outWidth, outHeight);
  }

  Future<void> _confirm(Size frame) async {
    final image = _image;
    if (image == null || _working) return;
    setState(() => _working = true);
    try {
      final path = await _export(image, _sourceRect(frame, image));
      if (mounted) Navigator.of(context).pop(path);
    } on Object {
      if (!mounted) return;
      setState(() => _working = false);
      showGlassToast(context, 'That photo could not be cropped.');
    }
  }

  /// Renders the chosen region and writes it out as a JPEG.
  ///
  /// JPEG rather than `toByteData(png)`: the crop of a 1920px photo is a
  /// several-megabyte PNG and this feed is read on rural connections, where
  /// that is the difference between a post going up and a post timing out.
  Future<String> _export(ui.Image image, Rect source) async {
    // Never larger than the region actually taken, and never past the picker's
    // own ceiling.
    final longest = math.max(source.width, source.height);
    final scale = longest > _maxOutputEdge ? _maxOutputEdge / longest : 1.0;
    final width = math.max(1, (source.width * scale).round());
    final height = math.max(1, (source.height * scale).round());

    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawImageRect(
      image,
      source,
      Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
      Paint()..filterQuality = FilterQuality.high,
    );
    final picture = recorder.endRecording();
    final rendered = await picture.toImage(width, height);
    picture.dispose();
    final ByteData? raw;
    try {
      raw = await rendered.toByteData(format: ui.ImageByteFormat.rawRgba);
    } finally {
      rendered.dispose();
    }
    if (raw == null) throw StateError('The cropped photo had no pixels.');

    // Encoding a couple of megapixels in Dart is a visible stall on a cheap
    // phone, so it happens off the UI isolate.
    final jpeg = await compute(
      _encodeJpeg,
      (
        pixels: raw.buffer.asUint8List(),
        width: width,
        height: height,
        quality: _quality,
      ),
    );

    final directory = await getTemporaryDirectory();
    final file = File(
      '${directory.path}/crop_'
      '${DateTime.now().microsecondsSinceEpoch}.jpg',
    );
    await file.writeAsBytes(jpeg, flush: true);
    return file.path;
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) => NightTheme(
    child: AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: const Color(0xFF070A09),
        body: SafeArea(child: _body(context)),
      ),
    ),
  );

  Widget _body(BuildContext context) {
    if (_loadFailure != null) return const _CropLoadFailure();
    final image = _image;
    if (image == null) {
      return const Center(
        child: SizedBox.square(
          dimension: 28,
          child: CircularProgressIndicator(strokeWidth: 2.6),
        ),
      );
    }

    return Column(
      children: [
        _CropTopBar(
          onCancel: () => Navigator.of(context).pop(),
          onRotate: _rotate,
          busy: _working,
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final available = Size(
                constraints.maxWidth - 32,
                constraints.maxHeight - 32,
              );
              if (available.width <= 0 || available.height <= 0) {
                return const SizedBox.shrink();
              }
              final frame = _frameFor(available, image);
              // A ratio change can leave the photo off-centre; the clamp is
              // re-applied on every build so the frame is never left uncovered.
              final displayed = _displayedSize(frame, image);
              final pan = _clampPan(_pan, frame, displayed);
              if (pan != _pan) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted) setState(() => _pan = pan);
                });
              }

              return Center(
                child: _CropFrame(
                  frame: frame,
                  displayed: displayed,
                  pan: pan,
                  image: image,
                  onScaleStart: _onScaleStart,
                  onScaleUpdate: (details) =>
                      _onScaleUpdate(details, frame, image),
                  onConfirm: () => _confirm(frame),
                  working: _working,
                  shape: _shape,
                  onShape: (shape) => setState(() {
                    _shape = shape;
                    _reset();
                  }),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// The frame, the shapes and the commit — kept together because the confirm
/// button needs the very frame the photo was measured against.
class _CropFrame extends StatelessWidget {
  const _CropFrame({
    required this.frame,
    required this.displayed,
    required this.pan,
    required this.image,
    required this.onScaleStart,
    required this.onScaleUpdate,
    required this.onConfirm,
    required this.working,
    required this.shape,
    required this.onShape,
  });

  final Size frame;
  final Size displayed;
  final Offset pan;
  final ui.Image image;
  final GestureScaleStartCallback onScaleStart;
  final GestureScaleUpdateCallback onScaleUpdate;
  final VoidCallback onConfirm;
  final bool working;
  final _CropShape shape;
  final ValueChanged<_CropShape> onShape;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      GestureDetector(
        onScaleStart: onScaleStart,
        onScaleUpdate: onScaleUpdate,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(
            width: frame.width,
            height: frame.height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: (frame.width - displayed.width) / 2 + pan.dx,
                  top: (frame.height - displayed.height) / 2 + pan.dy,
                  width: displayed.width,
                  height: displayed.height,
                  child: RawImage(image: image, fit: BoxFit.fill),
                ),
                const Positioned.fill(
                  child: IgnorePointer(child: _RuleOfThirds()),
                ),
              ],
            ),
          ),
        ),
      ),
      const SizedBox(height: 18),
      Wrap(
        spacing: 8,
        alignment: WrapAlignment.center,
        children: [
          for (final value in _CropShape.values)
            _ShapeChip(
              label: value.label,
              selected: value == shape,
              onTap: () => onShape(value),
            ),
        ],
      ),
      const SizedBox(height: 18),
      SizedBox(
        width: 200,
        child: FilledButton.icon(
          onPressed: working ? null : onConfirm,
          icon: working
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.check_rounded),
          label: Text(working ? 'Cropping…' : 'Use this crop'),
        ),
      ),
    ],
  );
}

/// The thirds grid. Faint, and only there because a crop is a composition
/// decision and this is the line people actually compose against.
class _RuleOfThirds extends StatelessWidget {
  const _RuleOfThirds();

  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _ThirdsPainter(),
    child: const SizedBox.expand(),
  );
}

class _ThirdsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..color = Colors.white.withValues(alpha: 0.22)
      ..strokeWidth = 1;
    for (var index = 1; index < 3; index++) {
      final dx = size.width * index / 3;
      final dy = size.height * index / 3;
      canvas
        ..drawLine(Offset(dx, 0), Offset(dx, size.height), line)
        ..drawLine(Offset(0, dy), Offset(size.width, dy), line);
    }
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = Colors.white.withValues(alpha: 0.65),
    );
  }

  @override
  bool shouldRepaint(_ThirdsPainter oldDelegate) => false;
}

class _ShapeChip extends StatelessWidget {
  const _ShapeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    child: Material(
      color: selected
          ? context.brand.gold.withValues(alpha: 0.26)
          : Colors.white.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? context.brand.gold : Colors.white,
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    ),
  );
}

class _CropTopBar extends StatelessWidget {
  const _CropTopBar({
    required this.onCancel,
    required this.onRotate,
    required this.busy,
  });

  final VoidCallback onCancel;
  final VoidCallback onRotate;
  final bool busy;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 4, 10, 0),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Cancel',
          onPressed: busy ? null : onCancel,
          icon: const Icon(Icons.close_rounded, color: Colors.white),
        ),
        const Expanded(
          child: Text(
            'Crop photo',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        IconButton(
          tooltip: 'Rotate',
          onPressed: busy ? null : onRotate,
          icon: const Icon(Icons.rotate_90_degrees_ccw_rounded,
              color: Colors.white),
        ),
      ],
    ),
  );
}

class _CropLoadFailure extends StatelessWidget {
  const _CropLoadFailure();

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.broken_image_outlined,
            color: Colors.white38,
            size: 34,
          ),
          const SizedBox(height: 14),
          const Text(
            'That photo could not be opened.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 18),
          OutlinedButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Go back'),
          ),
        ],
      ),
    ),
  );
}

/// Runs on a background isolate. Top-level because [compute] cannot carry a
/// closure over.
Uint8List _encodeJpeg(
  ({Uint8List pixels, int width, int height, int quality}) input,
) {
  final pixels = input.pixels;
  // `fromBytes` takes the whole buffer, not the view onto it, so a list that
  // does not start at byte zero would be read from the wrong offset and come
  // out as a smear. Crossing an isolate boundary usually lands at zero, but
  // "usually" is not a thing to encode somebody's photo on.
  final bytes =
      pixels.offsetInBytes == 0 &&
          pixels.lengthInBytes == pixels.buffer.lengthInBytes
      ? pixels.buffer
      : Uint8List.fromList(pixels).buffer;

  final image = img.Image.fromBytes(
    width: input.width,
    height: input.height,
    bytes: bytes,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
  return img.encodeJpg(image, quality: input.quality);
}

/// Opens the cropper for [path] and returns the cropped file, or the original
/// path if the member backed out.
///
/// Returning the original rather than null is what lets the callers stay one
/// line: cancelling a crop means "post it as it is", not "forget the photo".
Future<String> cropPhoto(BuildContext context, String path) async {
  final cropped = await Navigator.of(context).push<String>(
    MaterialPageRoute<String>(
      builder: (context) => PhotoCropScreen(path: path),
    ),
  );
  return cropped ?? path;
}
