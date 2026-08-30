import { beforeAll, describe, expect, it } from 'vitest';
import {
    applyMigrations,
    createPostAs,
    makeApp,
    memberJwt,
    staffJwt
} from './helpers.js';

beforeAll(async () => {
    await applyMigrations();
});

describe('GET /api/v1/config', () => {
    it('returns board metadata with cache headers', async () => {
        const { call } = makeApp({ boardTitle: 'StoreKit Feedback' });
        const res = await call('/api/v1/config');
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toContain('s-maxage=60');
        const body = await res.json();
        expect(body.boardTitle).toBe('StoreKit Feedback');
        expect(body.boards).toHaveLength(1);
        expect(body.boards[0].slug).toBe('feature-requests');
        expect(body.statuses).toContain('planned');
    });

    it('falls back to stored config when no options given', async () => {
        const { call } = makeApp();
        const body = await (await call('/api/v1/config')).json();
        expect(body.boardTitle).toBe('Feedback');
    });
});

describe('posts', () => {
    it('creates a post and lists it', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const post = await createPostAs(call, jwt, {
            title: 'Dark mode please',
            body: 'It burns **my eyes**'
        });
        expect(post.slug).toBe('dark-mode-please');
        expect(post.bodyHtml).toContain('<strong>my eyes</strong>');

        const list = await (await call('/api/v1/posts')).json();
        expect(list.posts.map(p => p.slug)).toContain('dark-mode-please');
    });

    it('generates unique slugs for duplicate titles', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const first = await createPostAs(call, jwt, { title: 'Same title' });
        const second = await createPostAs(call, jwt, { title: 'Same title' });
        expect(first.slug).toBe('same-title');
        expect(second.slug).toBe('same-title-2');
    });

    it('rejects invalid posts and anonymous creation', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const invalid = await call('/api/v1/posts', {
            method: 'POST',
            jwt,
            body: { title: '' }
        });
        expect(invalid.status).toBe(400);
        const anonymous = await call('/api/v1/posts', {
            method: 'POST',
            body: { title: 'No auth' }
        });
        expect(anonymous.status).toBe(401);
    });

    it('gets a post by slug and by id', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const post = await createPostAs(call, jwt, { title: 'Fetch me' });
        const bySlug = await (await call(`/api/v1/posts/${post.slug}`)).json();
        expect(bySlug.post.id).toBe(post.id);
        const byId = await (await call(`/api/v1/posts/${post.id}`)).json();
        expect(byId.post.slug).toBe(post.slug);
        expect((await call('/api/v1/posts/nope')).status).toBe(404);
    });

    it('sorts by top votes and by newest', async () => {
        const { call } = makeApp();
        const older = await createPostAs(call, await memberJwt(), {
            title: 'Older popular post'
        });
        const jwtB = await memberJwt({ sub: 'user-2', email: 'b@x.com' });
        const newer = await createPostAs(call, jwtB, { title: 'Newer post' });
        await call(`/api/v1/posts/${older.id}/vote`, {
            method: 'POST',
            jwt: jwtB
        });

        const top = await (await call('/api/v1/posts?sort=top')).json();
        expect(top.posts[0].id).toBe(older.id);
        const newest = await (await call('/api/v1/posts?sort=new')).json();
        expect(newest.posts[0].id).toBe(newer.id);
    });

    it('paginates with a keyset cursor', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        for (let i = 0; i < 5; i += 1) {
            await createPostAs(call, jwt, { title: `Cursor post ${i}` });
        }
        const page1 = await (
            await call('/api/v1/posts?sort=new&limit=2')
        ).json();
        expect(page1.posts).toHaveLength(2);
        expect(page1.nextCursor).toBeTruthy();
        const page2 = await (
            await call(
                `/api/v1/posts?sort=new&limit=2&cursor=${encodeURIComponent(
                    page1.nextCursor
                )}`
            )
        ).json();
        const ids1 = page1.posts.map(p => p.id);
        for (const post of page2.posts) {
            expect(ids1).not.toContain(post.id);
        }
    });

    it('counts posts by topic and status list', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        await createPostAs(call, jwt, {
            title: 'Topic post',
            topic: 'billing'
        });
        const body = await (
            await call('/api/v1/posts/count?topic=billing&status=open')
        ).json();
        expect(body.count).toBe(1);
        const none = await (
            await call('/api/v1/posts/count?topic=billing&status=complete')
        ).json();
        expect(none.count).toBe(0);
    });
});

describe('votes', () => {
    it('vote and unvote recompute vote_count', async () => {
        const { call } = makeApp();
        const author = await memberJwt();
        const voter = await memberJwt({ sub: 'voter-1', email: 'v@x.com' });
        const post = await createPostAs(call, author, { title: 'Voted post' });

        const voted = await (
            await call(`/api/v1/posts/${post.id}/vote`, {
                method: 'POST',
                jwt: voter
            })
        ).json();
        expect(voted.voteCount).toBe(1);

        // Voting twice is idempotent.
        const again = await (
            await call(`/api/v1/posts/${post.id}/vote`, {
                method: 'POST',
                jwt: voter
            })
        ).json();
        expect(again.voteCount).toBe(1);

        const unvoted = await (
            await call(`/api/v1/posts/${post.id}/vote`, {
                method: 'DELETE',
                jwt: voter
            })
        ).json();
        expect(unvoted.voteCount).toBe(0);
    });

    it('marks viewerHasVoted in authed lists', async () => {
        const { call } = makeApp();
        const voter = await memberJwt({ sub: 'voter-2', email: 'v2@x.com' });
        const post = await createPostAs(call, voter, { title: 'Own vote' });
        await call(`/api/v1/posts/${post.id}/vote`, {
            method: 'POST',
            jwt: voter
        });
        const list = await (await call('/api/v1/posts', { jwt: voter })).json();
        const mine = list.posts.find(p => p.id === post.id);
        expect(mine.viewerHasVoted).toBe(true);
    });
});

describe('comments', () => {
    it('creates comments, threads replies and bumps comment_count', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const post = await createPostAs(call, jwt, { title: 'Discussed' });

        const first = await (
            await call(`/api/v1/posts/${post.id}/comments`, {
                method: 'POST',
                jwt,
                body: { body: 'First!' }
            })
        ).json();
        await call(`/api/v1/posts/${post.id}/comments`, {
            method: 'POST',
            jwt,
            body: { body: 'A reply', parentId: first.comment.id }
        });

        const thread = await (
            await call(`/api/v1/posts/${post.id}/comments`)
        ).json();
        expect(thread.comments).toHaveLength(1);
        expect(thread.comments[0].replies).toHaveLength(1);
        expect(thread.comments[0].replies[0].body).toBe('A reply');

        const fresh = await (await call(`/api/v1/posts/${post.id}`)).json();
        expect(fresh.post.commentCount).toBe(2);
    });

    it('soft-deletes a comment into a tombstone when it has replies', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        const post = await createPostAs(call, jwt, { title: 'Tombstoned' });
        const parent = await (
            await call(`/api/v1/posts/${post.id}/comments`, {
                method: 'POST',
                jwt,
                body: { body: 'Parent' }
            })
        ).json();
        await call(`/api/v1/posts/${post.id}/comments`, {
            method: 'POST',
            jwt,
            body: { body: 'Child', parentId: parent.comment.id }
        });
        const del = await call(`/api/v1/comments/${parent.comment.id}`, {
            method: 'DELETE',
            jwt
        });
        expect(del.status).toBe(200);
        const thread = await (
            await call(`/api/v1/posts/${post.id}/comments`)
        ).json();
        expect(thread.comments[0].deleted).toBe(true);
        expect(thread.comments[0].body).toBeNull();
        expect(thread.comments[0].replies).toHaveLength(1);
    });

    it('marks staff comments as team', async () => {
        const { call } = makeApp();
        const post = await createPostAs(call, await memberJwt(), {
            title: 'Team reply'
        });
        const res = await (
            await call(`/api/v1/posts/${post.id}/comments`, {
                method: 'POST',
                jwt: await staffJwt(),
                body: { body: 'On it.' }
            })
        ).json();
        expect(res.comment.isTeam).toBe(true);
    });
});

describe('status changes', () => {
    it('staff can change status; members get 403', async () => {
        const { call } = makeApp();
        const post = await createPostAs(call, await memberJwt(), {
            title: 'To be planned'
        });
        const denied = await call(`/api/v1/posts/${post.id}/status`, {
            method: 'PATCH',
            jwt: await memberJwt(),
            body: { status: 'planned' }
        });
        expect(denied.status).toBe(403);

        const changed = await (
            await call(`/api/v1/posts/${post.id}/status`, {
                method: 'PATCH',
                jwt: await staffJwt(),
                body: { status: 'planned' }
            })
        ).json();
        expect(changed.post.status).toBe('planned');
        expect(changed.post.statusChangedAt).toBeTruthy();

        const bad = await call(`/api/v1/posts/${post.id}/status`, {
            method: 'PATCH',
            jwt: await staffJwt(),
            body: { status: 'shipped' }
        });
        expect(bad.status).toBe(400);
    });

    it('planned/in_progress/complete posts appear on the roadmap', async () => {
        const { call } = makeApp();
        const post = await createPostAs(call, await memberJwt(), {
            title: 'Roadmap item'
        });
        await call(`/api/v1/posts/${post.id}/status`, {
            method: 'PATCH',
            jwt: await staffJwt(),
            body: { status: 'in_progress' }
        });
        const roadmap = await (await call('/api/v1/roadmap')).json();
        expect(roadmap.in_progress.map(p => p.id)).toContain(post.id);
    });
});

describe('merge', () => {
    it('coalesces votes, moves comments and redirects the source', async () => {
        const { call } = makeApp();
        const author = await memberJwt();
        const keep = await createPostAs(call, author, { title: 'Keep me' });
        const dupe = await createPostAs(call, author, { title: 'Dupe' });

        // Voter A votes on both (must coalesce to one), voter B only on dupe.
        const voterA = await memberJwt({ sub: 'va', email: 'va@x.com' });
        const voterB = await memberJwt({ sub: 'vb', email: 'vb@x.com' });
        await call(`/api/v1/posts/${keep.id}/vote`, {
            method: 'POST',
            jwt: voterA
        });
        await call(`/api/v1/posts/${dupe.id}/vote`, {
            method: 'POST',
            jwt: voterA
        });
        await call(`/api/v1/posts/${dupe.id}/vote`, {
            method: 'POST',
            jwt: voterB
        });
        await call(`/api/v1/posts/${dupe.id}/comments`, {
            method: 'POST',
            jwt: author,
            body: { body: 'Moved comment' }
        });

        const merged = await (
            await call(`/api/v1/posts/${dupe.id}/merge`, {
                method: 'POST',
                jwt: await staffJwt(),
                body: { intoId: keep.id }
            })
        ).json();
        expect(merged.post.id).toBe(keep.id);
        expect(merged.post.voteCount).toBe(2);
        expect(merged.post.commentCount).toBe(1);

        const source = await (await call(`/api/v1/posts/${dupe.id}`)).json();
        expect(source.post.mergedInto).toEqual({
            id: keep.id,
            slug: keep.slug
        });

        // The source is hidden from lists; voting on it lands on the target.
        const list = await (await call('/api/v1/posts')).json();
        expect(list.posts.map(p => p.id)).not.toContain(dupe.id);
        const voteC = await (
            await call(`/api/v1/posts/${dupe.id}/vote`, {
                method: 'POST',
                jwt: await memberJwt({ sub: 'vc', email: 'vc@x.com' })
            })
        ).json();
        expect(voteC.postId).toBe(keep.id);
        expect(voteC.voteCount).toBe(3);
    });
});

describe('similar', () => {
    it('returns FTS matches for a draft title', async () => {
        const { call } = makeApp();
        const jwt = await memberJwt();
        await createPostAs(call, jwt, {
            title: 'Export orders as CSV',
            body: 'Need spreadsheet export for accounting'
        });
        await createPostAs(call, jwt, { title: 'Unrelated thing' });
        const res = await (
            await call('/api/v1/similar?title=csv%20export%20please')
        ).json();
        expect(res.posts.length).toBeGreaterThanOrEqual(1);
        expect(res.posts[0].title).toBe('Export orders as CSV');
    });

    it('survives hostile FTS operators', async () => {
        const { call } = makeApp();
        const res = await call(
            '/api/v1/similar?title=' +
                encodeURIComponent('"unbalanced AND (NEAR* OR')
        );
        expect(res.status).toBe(200);
    });
});
