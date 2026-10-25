// How one alert is split across a member's devices, and what each group is
// sent. The split decides whether an alert arrives at all: a data-only message
// sent to a build that cannot draw it shows nothing, and a system notification
// sent to a build that can draw its own hides the avatar, the picture and the
// Reply / Like / Mark as read buttons behind the system's plain layout.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RICH_PUSH_RENDERER,
  alertImageUrl,
  planPushGroups,
  rendersOnDevice,
} from '../../services/functions/lib/push.js';
import { senderAvatar } from '../../services/functions/lib/chat-notifications.js';

const picture = 'https://firebasestorage.googleapis.com/v0/b/x/o/post.jpg?alt=media';
const avatar = 'https://lh3.googleusercontent.com/a/amina';

const message = {
  title: 'Amina replied to you',
  body: 'This is lovely',
  redactedBody: 'New activity on Indigen World',
  imageUrl: picture,
  actor: { name: 'Amina', avatarUrl: avatar },
  channelId: 'indigen_community_v2',
  data: { type: 'reply', notificationId: 'n1', payloadVersion: '2', recipientId: 'me' },
};

const device = (token, overrides = {}) => ({
  token,
  previews: true,
  platform: 'android',
  renderer: RICH_PUSH_RENDERER,
  ...overrides,
});

test('only Android builds that announced the renderer draw their own alerts', () => {
  assert.equal(rendersOnDevice({ platform: 'android', renderer: 2 }, {}), true);
  // Every row written before this release has no renderer, and must keep
  // getting the system-drawn notification it already understands.
  assert.equal(rendersOnDevice({ platform: 'android', renderer: 0 }, {}), false);
  assert.equal(rendersOnDevice({ platform: 'ios', renderer: 2 }, {}), false);
});

test('the environment switch turns every device back to system notifications', () => {
  assert.equal(
    rendersOnDevice({ platform: 'android', renderer: 2 }, { RICH_NOTIFICATION_PUSH_ENABLED: 'false' }),
    false,
  );
  const groups = planPushGroups([device('a')], message, 1, { RICH_NOTIFICATION_PUSH_ENABLED: 'false' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].local, false);
  assert.ok(groups[0].notification);
});

test('a device that draws its own alert gets a data-only message with everything it draws', () => {
  const [group] = planPushGroups([device('a')], message, 1700000000000, {});
  assert.equal(group.local, true);
  // No notification block: with one, Android draws the plain system layout
  // while the app is in the background and never wakes it.
  assert.equal(group.notification, undefined);
  assert.equal(group.data.renderLocally, 'true');
  assert.equal(group.data.imageUrl, picture);
  assert.equal(group.data.actorName, 'Amina');
  assert.equal(group.data.actorAvatarUrl, avatar);
  assert.equal(group.data.channelId, 'indigen_community_v2');
  assert.equal(group.data.sentAt, '1700000000000');
  assert.equal(group.data.notificationId, 'n1');
});

test('an older build still sees the attached picture, drawn by the system', () => {
  const [group] = planPushGroups([device('old', { renderer: 0 })], message, 1, {});
  assert.equal(group.local, false);
  assert.deepEqual(group.notification, {
    title: 'Amina replied to you',
    body: 'This is lovely',
    imageUrl: picture,
  });
  assert.equal(group.data.renderLocally, undefined);
});

test('hidden previews hide the face and the picture as well as the words', () => {
  const groups = planPushGroups(
    [device('rich-private', { previews: false }), device('old-private', { previews: false, renderer: 0 })],
    message,
    1,
    {},
  );
  assert.equal(groups.length, 2);
  for (const group of groups) {
    assert.equal(group.data.title, 'Indigen World');
    assert.equal(group.data.body, 'New activity on Indigen World');
    assert.equal(group.data.imageUrl, '');
    assert.equal(group.data.actorName, '');
    assert.equal(group.data.actorAvatarUrl, '');
    assert.equal(group.data.previews, 'false');
  }
  const system = groups.find((group) => !group.local);
  assert.deepEqual(system.notification, { title: 'Indigen World', body: 'New activity on Indigen World' });
});

test('one member on four kinds of device is four groups, each token exactly once', () => {
  const groups = planPushGroups(
    [
      device('a'),
      device('b', { renderer: 0 }),
      device('c', { previews: false }),
      device('d', { previews: false, platform: 'ios' }),
    ],
    message,
    1,
    {},
  );
  const tokens = groups.flatMap((group) => group.tokens).sort();
  assert.deepEqual(tokens, ['a', 'b', 'c', 'd']);
  assert.equal(groups.length, 4);
});

test('pictures are only ever fetched from the app\'s own hosts', () => {
  assert.equal(alertImageUrl(picture), picture);
  assert.equal(alertImageUrl(avatar), avatar);
  assert.equal(alertImageUrl('http://firebasestorage.googleapis.com/x.jpg'), '');
  assert.equal(alertImageUrl('https://example.com/tracker.png'), '');
  assert.equal(alertImageUrl('https://firebasestorage.googleapis.com.example.com/x.jpg'), '');
  assert.equal(alertImageUrl('not a url'), '');
  assert.equal(alertImageUrl(42), '');
  const [group] = planPushGroups(
    [device('a')],
    { ...message, imageUrl: 'https://example.com/x.png', actor: { name: 'A', avatarUrl: 'https://example.com/a.png' } },
    1,
    {},
  );
  assert.equal(group.data.imageUrl, '');
  assert.equal(group.data.actorAvatarUrl, '');
});

test('a message alert carries the sender\'s face from the thread stamps', () => {
  const stamps = { amina: { displayName: 'Amina', avatarUrl: avatar }, kofi: { displayName: 'Kofi' } };
  assert.equal(senderAvatar(stamps, 'amina'), avatar);
  assert.equal(senderAvatar(stamps, 'kofi'), null);
  assert.equal(senderAvatar(null, 'amina'), null);
  assert.equal(senderAvatar({ amina: 'broken' }, 'amina'), null);
});
