import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let alice: User
let bob: User
let carol: User

const ids = (value: unknown): number[] =>
  (Array.isArray(value) ? value : []).map((v) =>
    typeof v === 'object' && v !== null ? (v as { id: number }).id : (v as number),
  )

describe('Mail', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    alice = await payload.create({
      collection: 'users',
      data: {
        email: `mailalice${stamp}@test.dev`,
        password: 'password123',
        name: 'Alice',
        username: `mailalice${stamp}`.slice(0, 30),
        role: 'user',
      },
    })
    bob = await payload.create({
      collection: 'users',
      data: {
        email: `mailbob${stamp}@test.dev`,
        password: 'password123',
        name: 'Bob',
        username: `mailbob${stamp}`.slice(0, 30),
        role: 'user',
      },
    })
    carol = await payload.create({
      collection: 'users',
      data: {
        email: `mailcarol${stamp}@test.dev`,
        password: 'password123',
        name: 'Carol',
        username: `mailcarol${stamp}`.slice(0, 30),
        role: 'user',
      },
    })
  })

  afterAll(async () => {
    if (!payload || !alice) return
    // Messages FK-reference threads, so they must go first.
    const threads = await payload.find({
      collection: 'threads',
      where: { participants: { contains: alice.id } },
      limit: 0,
      depth: 0,
    })
    for (const thread of threads.docs) {
      await payload.delete({
        collection: 'messages',
        where: { thread: { equals: thread.id } },
      })
      await payload.delete({
        collection: 'mail-attachments',
        where: { thread: { equals: thread.id } },
      })
      await payload.delete({ collection: 'threads', id: thread.id })
    }
    for (const user of [alice, bob, carol]) {
      if (user) await payload.delete({ collection: 'users', id: user.id })
    }
  })

  it('creates a thread and syncs denorms on first message', async () => {
    const thread = await payload.create({
      collection: 'threads',
      data: {
        participants: [alice.id, bob.id],
        subject: 'Hello there',
        visibleTo: [alice.id, bob.id],
      },
      user: alice,
      overrideAccess: false,
    })

    const message = await payload.create({
      collection: 'messages',
      data: { thread: thread.id, sender: alice.id, body: 'Hi Bob, how are you?' },
      user: alice,
      overrideAccess: false,
    })
    expect(ids(message.participants).sort()).toEqual([alice.id, bob.id].sort())

    const updated = await payload.findByID({ collection: 'threads', id: thread.id })
    expect(updated.lastSnippet).toBe('Hi Bob, how are you?')
    expect(updated.messageCount).toBe(1)
    expect(ids(updated.lastSender ? [updated.lastSender] : [])).toEqual([alice.id])
    expect(ids(updated.unreadFor)).toEqual([bob.id])
    expect(ids(updated.visibleTo).sort()).toEqual([alice.id, bob.id].sort())
  })

  it('lets participants read messages and blocks outsiders', async () => {
    const thread = await payload.create({
      collection: 'threads',
      data: {
        participants: [alice.id, bob.id],
        subject: 'Private',
        visibleTo: [alice.id, bob.id],
      },
      user: alice,
      overrideAccess: false,
    })
    await payload.create({
      collection: 'messages',
      data: { thread: thread.id, sender: alice.id, body: 'secret' },
      user: alice,
      overrideAccess: false,
    })

    const forBob = await payload.find({
      collection: 'messages',
      where: { thread: { equals: thread.id } },
      user: bob,
      overrideAccess: false,
    })
    expect(forBob.totalDocs).toBe(1)

    const forCarol = await payload.find({
      collection: 'messages',
      where: { thread: { equals: thread.id } },
      user: carol,
      overrideAccess: false,
    })
    expect(forCarol.totalDocs).toBe(0)

    // Rich-text bodies are sanitized on write — scripts/event handlers die.
    const dirty = await payload.create({
      collection: 'messages',
      data: {
        thread: thread.id,
        sender: alice.id,
        body: '<p>hi<script>alert(1)</script><a href="javascript:x" onclick="y">l</a></p>',
      },
      user: alice,
      overrideAccess: false,
    })
    expect(dirty.body).not.toContain('script')
    expect(dirty.body).not.toContain('onclick')
    expect(dirty.body).not.toContain('javascript:')
    expect(dirty.body).toContain('<p>hi')

    await expect(
      payload.create({
        collection: 'messages',
        data: { thread: thread.id, sender: carol.id, body: 'intruder' },
        user: carol,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('rejects threads the creator is not part of', async () => {
    await expect(
      payload.create({
        collection: 'threads',
        data: {
          participants: [bob.id, carol.id],
          subject: 'Not yours',
          visibleTo: [bob.id, carol.id],
        },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('scopes attachment reads to the uploader and thread participants', async () => {
    const thread = await payload.create({
      collection: 'threads',
      data: {
        participants: [alice.id, bob.id],
        subject: 'Attachment',
        visibleTo: [alice.id, bob.id],
      },
      user: alice,
      overrideAccess: false,
    })

    const attachment = await payload.create({
      collection: 'mail-attachments',
      data: { uploader: alice.id, thread: thread.id },
      file: {
        data: Buffer.from('hello bob'),
        mimetype: 'text/plain',
        name: 'note.txt',
        size: 9,
      },
      user: alice,
      overrideAccess: false,
    })

    // The hook denormalizes participants from the thread.
    expect(ids(attachment.participants).sort()).toEqual([alice.id, bob.id].sort())
    expect(ids([attachment.uploader])).toEqual([alice.id])

    await payload.create({
      collection: 'messages',
      data: {
        thread: thread.id,
        sender: alice.id,
        body: 'see attached',
        attachments: [attachment.id],
      },
      user: alice,
      overrideAccess: false,
    })

    // The other participant can read it; outsiders and anonymous users can't.
    const forBob = await payload.findByID({
      collection: 'mail-attachments',
      id: attachment.id,
      user: bob,
      overrideAccess: false,
    })
    expect(forBob.id).toBe(attachment.id)

    await expect(
      payload.findByID({
        collection: 'mail-attachments',
        id: attachment.id,
        user: carol,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.findByID({
        collection: 'mail-attachments',
        id: attachment.id,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Non-allowlisted types are rejected outright.
    await expect(
      payload.create({
        collection: 'mail-attachments',
        data: { uploader: alice.id, thread: thread.id },
        file: {
          data: Buffer.from('<svg onload=alert(1) />'),
          mimetype: 'image/svg+xml',
          name: 'evil.svg',
          size: 25,
        },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await payload.delete({ collection: 'mail-attachments', id: attachment.id })
  })

  it('resurfaces a deleted thread when a reply lands', async () => {
    const thread = await payload.create({
      collection: 'threads',
      data: {
        participants: [alice.id, bob.id],
        subject: 'Comeback',
        visibleTo: [alice.id, bob.id],
      },
      user: alice,
      overrideAccess: false,
    })
    await payload.create({
      collection: 'messages',
      data: { thread: thread.id, sender: alice.id, body: 'first' },
      user: alice,
      overrideAccess: false,
    })

    // Bob deletes the thread from his mailbox.
    await payload.update({
      collection: 'threads',
      id: thread.id,
      data: { visibleTo: [alice.id] },
    })

    // Alice sends another letter — the thread resurfaces for Bob.
    await payload.create({
      collection: 'messages',
      data: { thread: thread.id, sender: alice.id, body: 'second' },
      user: alice,
      overrideAccess: false,
    })

    const updated = await payload.findByID({ collection: 'threads', id: thread.id })
    expect(ids(updated.visibleTo).sort()).toEqual([alice.id, bob.id].sort())
    expect(ids(updated.unreadFor)).toEqual([bob.id])
    expect(updated.messageCount).toBe(2)
  })
})
