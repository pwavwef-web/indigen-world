// Sub-community Security Rules tests, run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root — wraps this in emulators:exec)
//
// Covers communitySpaces/{slug}, its memberships and its members-only posts, and
// the two places the existing feed rules learned about communities: a post
// tagged with a public community, and the "announcement" category.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const host = '127.0.0.1';
const port = 8080;
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

// Distinct from the ids other rules suites use, since every suite in a run
// shares one emulator.
const OWNER = 'space-owner-uid';
const MEMBER = 'space-member-uid';
const STRANGER = 'space-stranger-uid';
const NO_PROFILE = 'space-noprofile-uid';

function profile(uid, username) {
  return {
    uid,
    username,
    displayName: username,
    displayNameLower: username,
    bio: '',
    location: '',
    dialect: '',
    isVerified: false,
    verifiedKind: '',
    phoneVerified: false,
  };
}

function community(slug, ownerId, overrides = {}) {
  return {
    slug,
    name: 'Kasem Language Circle',
    nameLower: 'kasem language circle',
    description: 'Words from home.',
    category: 'language',
    language: 'Kasem',
    location: 'Navrongo',
    visibility: 'public',
    ownerId,
    memberCount: 1,
    rules: ['Be kind.'],
    status: 'active',
    searchTokens: ['ka', 'kas', 'kase', 'kasem'],
    avatarUrl: null,
    coverUrl: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function membership(uid, communityId, overrides = {}) {
  return {
    uid,
    communityId,
    role: 'member',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function post(authorId, overrides = {}) {
  return {
    authorId,
    author: { displayName: 'Member', username: 'member', avatarUrl: null },
    text: 'Ba zaana.',
    media: [],
    hasMedia: false,
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
    viewCount: 0,
    parentId: null,
    isReply: false,
    rootId: 'root',
    kasemConfirmed: false,
    ...overrides,
  };
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, `communityProfiles/${OWNER}`), profile(OWNER, 'space_owner'));
    await setDoc(doc(store, `communityProfiles/${MEMBER}`), profile(MEMBER, 'space_member'));
    await setDoc(doc(store, `communityProfiles/${STRANGER}`), profile(STRANGER, 'space_stranger'));

    // A public community with an owner and one member.
    await setDoc(doc(store, 'communitySpaces/open-circle'), community('open-circle', OWNER, { memberCount: 2 }));
    await setDoc(doc(store, `communitySpaces/open-circle/memberships/${OWNER}`), membership(OWNER, 'open-circle', { role: 'owner' }));
    await setDoc(doc(store, `communitySpaces/open-circle/memberships/${MEMBER}`), membership(MEMBER, 'open-circle'));

    // A private community with an owner, one member and one pending request.
    await setDoc(doc(store, 'communitySpaces/closed-circle'), community('closed-circle', OWNER, {
      visibility: 'private',
      memberCount: 2,
    }));
    await setDoc(doc(store, `communitySpaces/closed-circle/memberships/${OWNER}`), membership(OWNER, 'closed-circle', { role: 'owner' }));
    await setDoc(doc(store, `communitySpaces/closed-circle/memberships/${MEMBER}`), membership(MEMBER, 'closed-circle'));
    await setDoc(doc(store, 'communitySpaces/closed-circle/posts/secret'), post(MEMBER, {
      communityId: 'closed-circle',
      communityName: 'Closed',
      communityVisibility: 'private',
    }));
  });
});

after(async () => {
  await env?.cleanup();
});

const db = (ctx) => ctx.firestore();

// ── Creating ────────────────────────────────────────────────────────────────

test('a member with a profile creates a community with its owner row', async () => {
  const store = db(env.authenticatedContext(OWNER));
  const batch = writeBatch(store);
  batch.set(doc(store, 'communitySpaces/new-circle'), community('new-circle', OWNER));
  batch.set(doc(store, `communitySpaces/new-circle/memberships/${OWNER}`), membership(OWNER, 'new-circle', { role: 'owner' }));
  await assertSucceeds(batch.commit());
});

test('a community cannot be created over an existing slug', async () => {
  const store = db(env.authenticatedContext(STRANGER));
  const batch = writeBatch(store);
  batch.set(doc(store, 'communitySpaces/open-circle'), community('open-circle', STRANGER));
  batch.set(doc(store, `communitySpaces/open-circle/memberships/${STRANGER}`), membership(STRANGER, 'open-circle', { role: 'owner' }));
  await assertFails(batch.commit());
});

test('a community needs its owner row, a profile, a valid slug and an honest count', async () => {
  const owner = db(env.authenticatedContext(OWNER));
  // No owner row in the same commit.
  await assertFails(setDoc(doc(owner, 'communitySpaces/lonely-circle'), community('lonely-circle', OWNER)));

  // Somebody else named as owner.
  const forged = writeBatch(owner);
  forged.set(doc(owner, 'communitySpaces/forged-circle'), community('forged-circle', MEMBER));
  forged.set(doc(owner, `communitySpaces/forged-circle/memberships/${OWNER}`), membership(OWNER, 'forged-circle', { role: 'owner' }));
  await assertFails(forged.commit());

  // Invalid slug.
  const badSlug = writeBatch(owner);
  badSlug.set(doc(owner, 'communitySpaces/Bad--Slug'), community('Bad--Slug', OWNER));
  badSlug.set(doc(owner, `communitySpaces/Bad--Slug/memberships/${OWNER}`), membership(OWNER, 'Bad--Slug', { role: 'owner' }));
  await assertFails(badSlug.commit());

  // An inflated member count.
  const inflated = writeBatch(owner);
  inflated.set(doc(owner, 'communitySpaces/big-circle'), community('big-circle', OWNER, { memberCount: 900 }));
  inflated.set(doc(owner, `communitySpaces/big-circle/memberships/${OWNER}`), membership(OWNER, 'big-circle', { role: 'owner' }));
  await assertFails(inflated.commit());

  // A description over the limit.
  const long = writeBatch(owner);
  long.set(doc(owner, 'communitySpaces/long-circle'), community('long-circle', OWNER, { description: 'x'.repeat(501) }));
  long.set(doc(owner, `communitySpaces/long-circle/memberships/${OWNER}`), membership(OWNER, 'long-circle', { role: 'owner' }));
  await assertFails(long.commit());

  // No community profile.
  const noProfile = db(env.authenticatedContext(NO_PROFILE));
  const orphan = writeBatch(noProfile);
  orphan.set(doc(noProfile, 'communitySpaces/orphan-circle'), community('orphan-circle', NO_PROFILE));
  orphan.set(doc(noProfile, `communitySpaces/orphan-circle/memberships/${NO_PROFILE}`), membership(NO_PROFILE, 'orphan-circle', { role: 'owner' }));
  await assertFails(orphan.commit());

  // Signed out.
  const anon = db(env.unauthenticatedContext());
  await assertFails(setDoc(doc(anon, 'communitySpaces/anon-circle'), community('anon-circle', 'nobody')));
});

// ── Joining ─────────────────────────────────────────────────────────────────

test('joining a public community writes the row and the count together', async () => {
  const store = db(env.authenticatedContext(STRANGER));
  // Without the count, refused.
  await assertFails(setDoc(doc(store, `communitySpaces/open-circle/memberships/${STRANGER}`), membership(STRANGER, 'open-circle')));
  // Claiming a role, refused.
  const promoted = writeBatch(store);
  promoted.set(doc(store, `communitySpaces/open-circle/memberships/${STRANGER}`), membership(STRANGER, 'open-circle', { role: 'moderator' }));
  promoted.update(doc(store, 'communitySpaces/open-circle'), { memberCount: increment(1) });
  await assertFails(promoted.commit());

  const batch = writeBatch(store);
  batch.set(doc(store, `communitySpaces/open-circle/memberships/${STRANGER}`), membership(STRANGER, 'open-circle'));
  batch.update(doc(store, 'communitySpaces/open-circle'), { memberCount: increment(1) });
  await assertSucceeds(batch.commit());

  // And leaving takes the count back down with it.
  const leave = writeBatch(store);
  leave.delete(doc(store, `communitySpaces/open-circle/memberships/${STRANGER}`));
  leave.update(doc(store, 'communitySpaces/open-circle'), { memberCount: increment(-1) });
  await assertSucceeds(leave.commit());
});

test('a private community takes requests, not members', async () => {
  const store = db(env.authenticatedContext(STRANGER));
  // Joining outright is refused.
  const direct = writeBatch(store);
  direct.set(doc(store, `communitySpaces/closed-circle/memberships/${STRANGER}`), membership(STRANGER, 'closed-circle'));
  direct.update(doc(store, 'communitySpaces/closed-circle'), { memberCount: increment(1) });
  await assertFails(direct.commit());

  await assertSucceeds(setDoc(
    doc(store, `communitySpaces/closed-circle/memberships/${STRANGER}`),
    membership(STRANGER, 'closed-circle', { status: 'pending' }),
  ));
  // A pending member cannot approve themselves.
  const self = writeBatch(store);
  self.update(doc(store, `communitySpaces/closed-circle/memberships/${STRANGER}`), { status: 'active' });
  self.update(doc(store, 'communitySpaces/closed-circle'), { memberCount: increment(1) });
  await assertFails(self.commit());
});

test('a moderator approves a request with the count, and nobody else can', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'communitySpaces/closed-circle/memberships/approve-me-uid'),
      membership('approve-me-uid', 'closed-circle', { status: 'pending' }),
    );
  });
  const member = db(env.authenticatedContext(MEMBER));
  const byMember = writeBatch(member);
  byMember.update(doc(member, 'communitySpaces/closed-circle/memberships/approve-me-uid'), { status: 'active' });
  byMember.update(doc(member, 'communitySpaces/closed-circle'), { memberCount: increment(1) });
  await assertFails(byMember.commit());

  const owner = db(env.authenticatedContext(OWNER));
  // Without the count, refused.
  await assertFails(updateDoc(doc(owner, 'communitySpaces/closed-circle/memberships/approve-me-uid'), { status: 'active' }));
  const approve = writeBatch(owner);
  approve.update(doc(owner, 'communitySpaces/closed-circle/memberships/approve-me-uid'), { status: 'active' });
  approve.update(doc(owner, 'communitySpaces/closed-circle'), { memberCount: increment(1) });
  await assertSucceeds(approve.commit());
});

test('owners cannot leave, and a banned member cannot un-ban themselves', async () => {
  const owner = db(env.authenticatedContext(OWNER));
  const leave = writeBatch(owner);
  leave.delete(doc(owner, `communitySpaces/open-circle/memberships/${OWNER}`));
  leave.update(doc(owner, 'communitySpaces/open-circle'), { memberCount: increment(-1) });
  await assertFails(leave.commit());

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'communitySpaces/open-circle/memberships/banned-uid'),
      membership('banned-uid', 'open-circle', { status: 'banned' }),
    );
  });
  const banned = db(env.authenticatedContext('banned-uid'));
  await assertFails(deleteDoc(doc(banned, 'communitySpaces/open-circle/memberships/banned-uid')));
});

test('a member cannot promote themselves or edit the community', async () => {
  const member = db(env.authenticatedContext(MEMBER));
  await assertFails(updateDoc(doc(member, `communitySpaces/open-circle/memberships/${MEMBER}`), { role: 'admin' }));
  await assertFails(updateDoc(doc(member, 'communitySpaces/open-circle'), { description: 'Mine now.' }));
  await assertFails(updateDoc(doc(member, 'communitySpaces/open-circle'), { memberCount: 5000 }));

  const owner = db(env.authenticatedContext(OWNER));
  await assertSucceeds(updateDoc(doc(owner, 'communitySpaces/open-circle'), { description: 'Words from home, daily.' }));
  // Visibility is frozen even for the owner.
  await assertFails(updateDoc(doc(owner, 'communitySpaces/open-circle'), { visibility: 'private' }));
});

// ── Private content ─────────────────────────────────────────────────────────

test('a private community is findable but its posts and members are not', async () => {
  const stranger = db(env.authenticatedContext(STRANGER));
  const anon = db(env.unauthenticatedContext());
  const member = db(env.authenticatedContext(MEMBER));

  await assertSucceeds(getDoc(doc(anon, 'communitySpaces/closed-circle')));
  await assertFails(getDoc(doc(stranger, 'communitySpaces/closed-circle/posts/secret')));
  await assertFails(getDocs(collection(stranger, 'communitySpaces/closed-circle/posts')));
  await assertFails(getDocs(collection(anon, 'communitySpaces/closed-circle/memberships')));

  await assertSucceeds(getDoc(doc(member, 'communitySpaces/closed-circle/posts/secret')));
  await assertSucceeds(getDocs(query(collection(member, 'communitySpaces/closed-circle/posts'), where('isReply', '==', false))));
  await assertSucceeds(getDocs(collection(member, 'communitySpaces/closed-circle/memberships')));

  // A public community's member list is public.
  await assertSucceeds(getDocs(collection(anon, 'communitySpaces/open-circle/memberships')));
});

test('members list their own memberships across communities, and only their own', async () => {
  const member = db(env.authenticatedContext(MEMBER));
  await assertSucceeds(getDocs(query(collectionGroup(member, 'memberships'), where('uid', '==', MEMBER))));
  await assertFails(getDocs(query(collectionGroup(member, 'memberships'), where('uid', '==', OWNER))));
});

test('only active members post into a private community, without polls or quotes', async () => {
  const stamp = { communityId: 'closed-circle', communityName: 'Closed', communityVisibility: 'private' };
  const stranger = db(env.authenticatedContext(STRANGER));
  await assertFails(setDoc(doc(stranger, 'communitySpaces/closed-circle/posts/from-stranger'), post(STRANGER, stamp)));

  const member = db(env.authenticatedContext(MEMBER));
  await assertSucceeds(setDoc(doc(member, 'communitySpaces/closed-circle/posts/from-member'), post(MEMBER, stamp)));
  await assertFails(setDoc(doc(member, 'communitySpaces/closed-circle/posts/with-poll'), post(MEMBER, {
    ...stamp,
    poll: { options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], totalVotes: 0 },
  })));
  // Stamped as public inside the private collection.
  await assertFails(setDoc(doc(member, 'communitySpaces/closed-circle/posts/mislabelled'), post(MEMBER, {
    ...stamp,
    communityVisibility: 'public',
  })));

  // The owner, as a moderator, may take a member's post down.
  const owner = db(env.authenticatedContext(OWNER));
  await assertSucceeds(deleteDoc(doc(owner, 'communitySpaces/closed-circle/posts/from-member')));
});

// ── The main feed ───────────────────────────────────────────────────────────

test('a post tagged with a public community needs a member behind it', async () => {
  const stamp = { communityId: 'open-circle', communityName: 'Open', communityVisibility: 'public' };
  const stranger = db(env.authenticatedContext(STRANGER));
  await assertFails(setDoc(doc(stranger, 'communityPosts/space-stranger-post'), post(STRANGER, stamp)));

  const member = db(env.authenticatedContext(MEMBER));
  await assertSucceeds(setDoc(doc(member, 'communityPosts/space-member-post'), post(MEMBER, stamp)));
  // A public post may not claim to be private, nor be tagged into a private
  // community to leak past its wall.
  await assertFails(setDoc(doc(member, 'communityPosts/space-private-leak'), post(MEMBER, {
    communityId: 'closed-circle',
    communityName: 'Closed',
    communityVisibility: 'public',
  })));

  // Moderators of the community may remove it from the feed.
  const owner = db(env.authenticatedContext(OWNER));
  await assertSucceeds(deleteDoc(doc(owner, 'communityPosts/space-member-post')));
});

test('announcements are reserved; other categories are open', async () => {
  const member = db(env.authenticatedContext(MEMBER));
  await assertSucceeds(setDoc(doc(member, 'communityPosts/space-question'), post(MEMBER, { category: 'question' })));
  await assertFails(setDoc(doc(member, 'communityPosts/space-announce'), post(MEMBER, { category: 'announcement' })));
  await assertFails(setDoc(doc(member, 'communityPosts/space-bogus'), post(MEMBER, { category: 'gossip' })));

  // The owner moderates open-circle, so may announce inside it.
  const owner = db(env.authenticatedContext(OWNER));
  await assertSucceeds(setDoc(doc(owner, 'communityPosts/space-owner-announce'), post(OWNER, {
    category: 'announcement',
    communityId: 'open-circle',
    communityName: 'Open',
    communityVisibility: 'public',
  })));

  // Ordinary posts with no community or category are untouched.
  await assertSucceeds(setDoc(doc(member, 'communityPosts/space-plain'), post(MEMBER)));
});

test('a community can be reported without naming a post', async () => {
  const member = db(env.authenticatedContext(MEMBER));
  await assertSucceeds(setDoc(doc(member, 'communityReports/space-report'), {
    postId: '',
    communityId: 'open-circle',
    targetType: 'community',
    reporterId: MEMBER,
    reason: 'Spam or advertising',
    status: 'open',
  }));
  await assertFails(setDoc(doc(member, 'communityReports/space-empty-report'), {
    postId: '',
    reporterId: MEMBER,
    reason: 'Spam or advertising',
    status: 'open',
  }));
});

test('daily prompts are read by everybody and written by staff', async () => {
  const anon = db(env.unauthenticatedContext());
  const member = db(env.authenticatedContext(MEMBER));
  const staff = db(env.authenticatedContext('space-staff-uid', { role: 'admin' }));
  await assertSucceeds(getDoc(doc(anon, 'communityPrompts/home')));
  await assertFails(setDoc(doc(member, 'communityPrompts/home'), { title: 'Mine' }));
  await assertSucceeds(setDoc(doc(staff, 'communityPrompts/home'), { title: 'Today in Kasem', subtitle: 'Share a word from home' }));
});

// ── Running a community ─────────────────────────────────────────────────────

test('admins edit the community profile; moderators and members cannot', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, 'communitySpaces/edit-circle'), community('edit-circle', OWNER, { memberCount: 3 }));
    await setDoc(doc(store, `communitySpaces/edit-circle/memberships/${OWNER}`), membership(OWNER, 'edit-circle', { role: 'owner' }));
    await setDoc(doc(store, 'communitySpaces/edit-circle/memberships/edit-admin-uid'), membership('edit-admin-uid', 'edit-circle', { role: 'admin' }));
    await setDoc(doc(store, 'communitySpaces/edit-circle/memberships/edit-mod-uid'), membership('edit-mod-uid', 'edit-circle', { role: 'moderator' }));
  });
  const edit = {
    name: 'Edited Circle',
    nameLower: 'edited circle',
    description: 'New words.',
    rules: ['Be kind.', 'Credit your sources.'],
    searchTokens: ['ed', 'edi', 'edited'],
    avatarUrl: 'https://example.test/a.png',
  };
  const admin = db(env.authenticatedContext('edit-admin-uid'));
  await assertSucceeds(updateDoc(doc(admin, 'communitySpaces/edit-circle'), edit));
  // A name whose lowercase copy does not match would break search.
  await assertFails(updateDoc(doc(admin, 'communitySpaces/edit-circle'), { name: 'Other', nameLower: 'wrong' }));
  // The address, owner and visibility are not the profile.
  await assertFails(updateDoc(doc(admin, 'communitySpaces/edit-circle'), { ownerId: 'edit-admin-uid' }));

  const moderator = db(env.authenticatedContext('edit-mod-uid'));
  await assertFails(updateDoc(doc(moderator, 'communitySpaces/edit-circle'), { description: 'Moderated.' }));
});

test('an owner hands the community to a member in one commit', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, 'communitySpaces/handover-circle'), community('handover-circle', OWNER, { memberCount: 2 }));
    await setDoc(doc(store, `communitySpaces/handover-circle/memberships/${OWNER}`), membership(OWNER, 'handover-circle', { role: 'owner' }));
    await setDoc(doc(store, `communitySpaces/handover-circle/memberships/${MEMBER}`), membership(MEMBER, 'handover-circle'));
  });
  const owner = db(env.authenticatedContext(OWNER));

  // To somebody who is not a member.
  const outsider = writeBatch(owner);
  outsider.update(doc(owner, 'communitySpaces/handover-circle'), { ownerId: STRANGER });
  outsider.update(doc(owner, `communitySpaces/handover-circle/memberships/${OWNER}`), { role: 'admin' });
  await assertFails(outsider.commit());

  // Renaming the owner without moving either role.
  await assertFails(updateDoc(doc(owner, 'communitySpaces/handover-circle'), { ownerId: MEMBER }));

  // A member cannot take it.
  const member = db(env.authenticatedContext(MEMBER));
  const grab = writeBatch(member);
  grab.update(doc(member, 'communitySpaces/handover-circle'), { ownerId: MEMBER });
  grab.update(doc(member, `communitySpaces/handover-circle/memberships/${MEMBER}`), { role: 'owner' });
  await assertFails(grab.commit());

  const handover = writeBatch(owner);
  handover.update(doc(owner, 'communitySpaces/handover-circle'), { ownerId: MEMBER, updatedAt: serverTimestamp() });
  handover.update(doc(owner, `communitySpaces/handover-circle/memberships/${MEMBER}`), { role: 'owner', updatedAt: serverTimestamp() });
  handover.update(doc(owner, `communitySpaces/handover-circle/memberships/${OWNER}`), { role: 'admin', updatedAt: serverTimestamp() });
  await assertSucceeds(handover.commit());

  // The former owner is an admin now, and may leave like anybody else.
  const leave = writeBatch(owner);
  leave.delete(doc(owner, `communitySpaces/handover-circle/memberships/${OWNER}`));
  leave.update(doc(owner, 'communitySpaces/handover-circle'), { memberCount: increment(-1) });
  await assertSucceeds(leave.commit());
});

test('an owner alone in a community may close it, and nobody else', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, 'communitySpaces/solo-circle'), community('solo-circle', OWNER, { memberCount: 1 }));
    await setDoc(doc(store, `communitySpaces/solo-circle/memberships/${OWNER}`), membership(OWNER, 'solo-circle', { role: 'owner' }));
    await setDoc(doc(store, 'communitySpaces/busy-circle'), community('busy-circle', OWNER, { memberCount: 2 }));
    await setDoc(doc(store, `communitySpaces/busy-circle/memberships/${OWNER}`), membership(OWNER, 'busy-circle', { role: 'owner' }));
    await setDoc(doc(store, `communitySpaces/busy-circle/memberships/${MEMBER}`), membership(MEMBER, 'busy-circle'));
  });
  const owner = db(env.authenticatedContext(OWNER));

  const busy = writeBatch(owner);
  busy.update(doc(owner, 'communitySpaces/busy-circle'), { status: 'closed', memberCount: 0 });
  busy.delete(doc(owner, `communitySpaces/busy-circle/memberships/${OWNER}`));
  await assertFails(busy.commit());

  // Closing without leaving, or leaving without closing.
  await assertFails(updateDoc(doc(owner, 'communitySpaces/solo-circle'), { status: 'closed', memberCount: 0 }));
  await assertFails(deleteDoc(doc(owner, `communitySpaces/solo-circle/memberships/${OWNER}`)));

  const close = writeBatch(owner);
  close.update(doc(owner, 'communitySpaces/solo-circle'), { status: 'closed', memberCount: 0, updatedAt: serverTimestamp() });
  close.delete(doc(owner, `communitySpaces/solo-circle/memberships/${OWNER}`));
  await assertSucceeds(close.commit());

  // A closed community takes no new members.
  const stranger = db(env.authenticatedContext(STRANGER));
  const join = writeBatch(stranger);
  join.set(doc(stranger, `communitySpaces/solo-circle/memberships/${STRANGER}`), membership(STRANGER, 'solo-circle'));
  join.update(doc(stranger, 'communitySpaces/solo-circle'), { memberCount: increment(1) });
  await assertFails(join.commit());
});

test('the cultural registry keeps its own collection', async () => {
  // `communities` is the admin-managed registry from packages/contracts. A
  // member who can create a community space must not be able to write there.
  const member = db(env.authenticatedContext(MEMBER));
  await assertFails(setDoc(doc(member, 'communities/kasena-community'), { name: 'Kassena' }));
});
