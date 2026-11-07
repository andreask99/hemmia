import { useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { MAX_MESSAGE_CHARS } from '@hemmia/shared';
import { useT } from '../i18n/index.tsx';
import {
  AttachButton,
  isUploading,
  type PendingAttachment,
  PendingAttachments,
} from './AttachmentPicker.tsx';
import { SendIcon, StopIcon } from '@hemmia/ui';

export function Composer({
  busy,
  onSend,
  onStop,
  attachments,
  onAttachmentsChange,
  blocked = false,
  initialText = '',
  limit = { model: '', chars: MAX_MESSAGE_CHARS },
  longer,
}: {
  busy: boolean;
  onSend: (text: string, attachmentIds: string[]) => void;
  onStop: () => void;
  attachments: PendingAttachment[];
  onAttachmentsChange: (items: PendingAttachment[]) => void;
  /** Sending is blocked (e.g. photos attached but the model can't see them). */
  blocked?: boolean;
  /** Text to start with (an example suggestion). */
  initialText?: string;
  /** The chosen model's message limit, and a model that can read longer texts (if any). */
  limit?: { model: string; chars: number };
  longer?: { model: string; chars: number; onSwitch: () => void };
}) {
  const t = useT();
  const [text, setText] = useState(initialText);
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = attachments.flatMap((p) => (p.attachment && !p.failed ? [p.attachment.id] : []));
  const tooLong = text.length > limit.chars;
  const canSwitch = longer !== undefined && text.length <= longer.chars;
  const canSend =
    !busy &&
    !blocked &&
    !tooLong &&
    !attachments.some(isUploading) &&
    (text.trim() !== '' || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(text, ready);
    setText('');
    setNotice(null);
    onAttachmentsChange([]);
    // Phones: close the keyboard so the reply is visible. Desktop: keep typing.
    if (window.matchMedia('(pointer: coarse)').matches) ref.current?.blur();
    else ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on desktop; on touch devices Enter is a newline and the button sends.
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        submit();
      }}
      className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-3xl">
        {tooLong && (
          <div
            role="alert"
            className="mb-2 flex flex-wrap items-center gap-2 px-1 text-sm text-danger"
          >
            <span>
              {t('chat.tooLong', {
                model: limit.model,
                count: text.length.toLocaleString(),
                max: limit.chars.toLocaleString(),
              })}{' '}
              {!canSwitch && t('chat.tooLongShorten')}
            </span>
            {canSwitch && (
              <button
                type="button"
                onClick={longer.onSwitch}
                className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-on-forest"
              >
                {t('chat.switchLonger', {
                  model: longer.model,
                  max: longer.chars.toLocaleString(),
                })}
              </button>
            )}
          </div>
        )}
        {notice && (
          <p role="alert" className="mb-2 px-1 text-sm text-danger">
            {notice}
          </p>
        )}
        <div className="rounded-[26px] border border-line bg-card shadow-[0_2px_12px_rgba(23,35,31,0.06)] transition-[border-color,box-shadow] duration-200 focus-within:border-forest/30 focus-within:shadow-[0_2px_18px_rgba(31,77,63,0.14)]">
          <PendingAttachments items={attachments} onChange={onAttachmentsChange} />
          <div className="flex items-end gap-1 p-1.5">
            <AttachButton
              items={attachments}
              onChange={onAttachmentsChange}
              onNotice={setNotice}
              disabled={busy}
            />
            <textarea
              name="message"
              ref={ref}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              onKeyDown={onKeyDown}
              aria-label={t('chat.placeholder')}
              placeholder={t('chat.placeholder')}
              className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-ink placeholder:text-muted focus:outline-none"
            />
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label={t('chat.stop')}
                title={t('chat.stop')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper"
              >
                <StopIcon size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label={t('chat.send')}
                title={t('chat.send')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest text-on-forest transition-colors hover:bg-forest-hover disabled:bg-champagne disabled:text-muted"
              >
                <SendIcon size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
