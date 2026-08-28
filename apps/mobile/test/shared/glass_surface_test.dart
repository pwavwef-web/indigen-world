// The glass the whole app is now made of.
//
// The two things worth pinning down are the performance decision and the
// accessibility one: a feed card must not draw a backdrop blur (twenty save
// layers scrolling past is what turns a cheap Android phone into a slideshow),
// and a tappable pane must still announce itself as a button.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

Widget _host(Widget child) => MaterialApp(
  theme: buildIndigenTheme(),
  home: Scaffold(body: Center(child: child)),
);

void main() {
  testWidgets('a singular glass surface draws a real backdrop blur', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const GlassSurface(child: Text('Panel'))));
    await tester.pump();
    expect(find.byType(BackdropFilter), findsOneWidget);
  });

  testWidgets('a list-item card does not', (tester) async {
    await tester.pumpWidget(
      _host(const GlassCard.listItem(child: Text('Row'))),
    );
    await tester.pump();
    expect(find.byType(BackdropFilter), findsNothing);
    // The look survives without it: the graded fill and the lit edge are what
    // make it read as glass.
    expect(find.byType(GlassSurface), findsOneWidget);
  });

  testWidgets('a tappable pane is a button to a screen reader', (tester) async {
    final handle = tester.ensureSemantics();
    var taps = 0;
    await tester.pumpWidget(
      _host(
        GlassCard(
          semanticLabel: 'Open the thing',
          onTap: () => taps++,
          child: const Text('Tap me'),
        ),
      ),
    );
    await tester.pump();

    expect(
      tester.getSemantics(find.byType(InkWell)),
      isSemantics(
        isButton: true,
        isFocusable: true,
        hasTapAction: true,
        // The card's own label leads, and the content it wraps follows — so a
        // reader hears what the button is for before what is on it.
        label: 'Open the thing\nTap me',
      ),
    );

    await tester.tap(find.text('Tap me'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(taps, 1);
    handle.dispose();
  });

  testWidgets('a pane with no handler is not announced as a button', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const GlassCard(child: Text('Static'))));
    await tester.pump();
    final semantics = tester.widget<Semantics>(
      find
          .ancestor(
            of: find.byType(AnimatedScale),
            matching: find.byType(Semantics),
          )
          .first,
    );
    expect(semantics.properties.button, isFalse);
  });

  testWidgets('a glass pill inverts when it is the selected choice', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            GlassPill(label: 'For you', selected: true),
            GlassPill(label: 'Following'),
          ],
        ),
      ),
    );
    await tester.pump();

    // The selected pill fills with the accent and takes the colour that reads
    // on it; the other stays quiet. That contrast is the whole affordance.
    final selected = tester.widget<Text>(find.text('For you'));
    final unselected = tester.widget<Text>(find.text('Following'));
    expect(selected.style?.color, BrandPalette.light.onAccentFill);
    expect(unselected.style?.color, BrandPalette.light.mutedInk);
  });

  testWidgets('the skeleton stands still when animations are switched off', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildIndigenTheme(),
        home: const MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: Scaffold(body: GlassSkeleton(height: 100)),
        ),
      ),
    );
    // A sweeping highlight is decoration, and that setting is a request to
    // stop decorating. The proof is that the frame schedule goes quiet: a
    // skeleton still running its repeating controller would never settle.
    await tester.pumpAndSettle();
    expect(find.byType(GlassSkeleton), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(GlassSkeleton),
        matching: find.byType(AnimatedBuilder),
      ),
      findsNothing,
    );
  });

  testWidgets('an empty state offers a way out rather than a paragraph', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        GlassEmptyState(
          icon: Icons.inbox_rounded,
          title: 'Nothing here yet',
          action: FilledButton(onPressed: () {}, child: const Text('Add one')),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Nothing here yet'), findsOneWidget);
    expect(find.text('Add one'), findsOneWidget);
    // There is deliberately nowhere to put a paragraph.
    expect(find.byType(Text), findsNWidgets(2));
  });

  testWidgets('a glass row keeps its supporting line to one line', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const SizedBox(
          width: 300,
          child: GlassRow(
            icon: Icons.tune_rounded,
            title: 'App settings',
            detail:
                'A supporting line long enough that it would wrap into a '
                'paragraph if it were ever allowed to',
          ),
        ),
      ),
    );
    await tester.pump();

    final detail = tester.widget<Text>(
      find.textContaining('A supporting line'),
    );
    expect(detail.maxLines, 1);
    expect(detail.overflow, TextOverflow.ellipsis);
  });
}
