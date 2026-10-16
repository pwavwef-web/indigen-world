import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/video_editor/mobile_timeline.dart';
void main() {
  test('source-anchored captions follow trim, speed, split and reorder', () {
    final project = MobileTimeline(id: 'project', ownerUid: 'member', scenes: [{'id': 'scene', 'kind': 'video', 'mediaId': 'clip', 'sourceIn': 2, 'duration': 4, 'speed': 2, 'overlays': [{'id': 'caption', 'type': 'caption', 'text': 'Kasem supplied text', 'sourceStart': 4, 'sourceEnd': 8}]}]);
    final before = project.renderSpec({'caption': 'owned-layer.png'});
    expect((before['layers'] as List).single['start'], 1);
    expect((before['layers'] as List).single['end'], 3);
    project.split(0, 2);
    expect(project.scenes[1]['sourceIn'], 6);
    expect(project.duration, 4);
    final split = project.renderSpec({'caption': 'owned-layer.png'});
    expect((split['layers'] as List).length, 2);
    expect((split['layers'] as List)[1]['start'], 2);
    final reloaded = MobileTimeline.fromJson(project.toJson());
    expect(reloaded.scenes[0]['overlays'][0]['text'], 'Kasem supplied text');
  });
  test('unknown project contracts and missing raster assets are refused without flattening', () {
    expect(() => MobileTimeline.fromJson({'version': 9, 'contract': 'web-project'}), throwsStateError);
    final project = MobileTimeline(id: 'project', ownerUid: 'member', scenes: [{'id': 'scene', 'kind': 'video', 'mediaId': 'clip', 'duration': 4, 'overlays': [{'id': 'title', 'text': 'A title', 'sourceStart': 0, 'sourceEnd': 4}]}]);
    expect(() => project.renderSpec({}), throwsStateError);
  });
}
