import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/mentions.dart';

void main() {
  test('Kawuri mention identity carries its Firebase avatar', () {
    expect(kawuriProfile.uid, 'kawuri');
    expect(kawuriProfile.username, kawuriHandle);
    expect(kawuriProfile.isVerified, isTrue);
    expect(kawuriProfile.avatarUrl, kawuriCommunityAvatarUrl);
    expect(
      kawuriCommunityAvatarUrl,
      startsWith('https://firebasestorage.googleapis.com/'),
    );
  });
}
