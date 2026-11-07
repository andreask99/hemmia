import { describe, expect, it } from 'vitest';
import { SendMessageRequest, StreamEvent, UpdateChatRequest } from './chat.ts';

describe('SendMessageRequest', () => {
  it('needs text or a photo', () => {
    expect(SendMessageRequest.safeParse({ content: '  ' }).success).toBe(false);
    expect(SendMessageRequest.safeParse({ content: 'hi' }).success).toBe(true);
    expect(SendMessageRequest.safeParse({ content: '', attachmentIds: ['a1'] }).success).toBe(true);
  });

  it('allows at most 6 attachments', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(SendMessageRequest.safeParse({ content: 'x', attachmentIds: ids }).success).toBe(false);
  });

  it('rejects ids that could break paths or AAD', () => {
    expect(SendMessageRequest.safeParse({ content: 'x', attachmentIds: ['../x'] }).success).toBe(
      false,
    );
    expect(SendMessageRequest.safeParse({ content: 'x', attachmentIds: ['a|b'] }).success).toBe(
      false,
    );
  });
});

describe('UpdateChatRequest', () => {
  it('needs at least one field', () => {
    expect(UpdateChatRequest.safeParse({}).success).toBe(false);
    expect(UpdateChatRequest.safeParse({ title: 'Trip' }).success).toBe(true);
  });
});

describe('StreamEvent', () => {
  it('parses known events and rejects unknown ones', () => {
    expect(StreamEvent.parse({ type: 'token', text: 'Hal' })).toEqual({
      type: 'token',
      text: 'Hal',
    });
    expect(StreamEvent.safeParse({ type: 'queued', position: 0 }).success).toBe(false);
    expect(StreamEvent.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
