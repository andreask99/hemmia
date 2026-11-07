import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  type Agent,
  AGENT_INSTRUCTIONS_MAX,
  type AgentDraft,
  type AgentTemplate,
  type SaveAgentRequest,
} from '@hemmia/shared';
import { useAgents, useDeleteAgent, useDraftAgent, useSaveAgent } from '../agents/hooks.ts';
import { useMe } from '../auth/hooks.ts';
import { modelLabel, useModels } from '../chat/hooks.ts';
import { PageHeader } from '../components/layout.tsx';
import { Alert, Button, Card, Field } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';

interface Form {
  name: string;
  emoji: string;
  description: string;
  instructions: string;
  examples: [string, string, string];
  modelId: string;
  think: 'default' | 'on' | 'off';
  webSearch: boolean;
  images: boolean;
  family: boolean;
}

const EMPTY: Form = {
  name: '',
  emoji: '',
  description: '',
  instructions: '',
  examples: ['', '', ''],
  modelId: '',
  think: 'default',
  webSearch: true,
  images: true,
  family: false,
};

const three = (list: readonly string[]): [string, string, string] => [
  list[0] ?? '',
  list[1] ?? '',
  list[2] ?? '',
];

function formFrom(source: Agent | AgentTemplate): Form {
  return {
    name: source.name,
    emoji: source.emoji,
    description: source.description,
    instructions: source.instructions,
    examples: three(source.examples),
    modelId: source.modelId ?? '',
    think: source.think === null ? 'default' : source.think ? 'on' : 'off',
    webSearch: source.webSearch,
    images: source.images,
    family: 'scope' in source && source.scope === 'family',
  };
}

const input =
  'min-h-12 w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-base text-ink focus:border-forest focus:outline-none disabled:opacity-60';
const label = 'mb-1.5 block text-sm font-medium text-muted';

/** Loads the agent (or template), then renders the editor with it as the starting form. */
export function AgentEditorPage() {
  const { agentId } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const { data, isLoading } = useAgents();
  const title = agentId ? t('agentEditor.titleEdit') : t('agentEditor.titleNew');
  const header = (
    <PageHeader>
      <h1 className="font-display text-[19px] font-semibold">{title}</h1>
    </PageHeader>
  );

  if (isLoading || (!data && agentId)) {
    return <div className="flex min-h-0 flex-1 flex-col">{header}</div>;
  }
  const agent = agentId ? data?.agents.find((a) => a.id === agentId) : undefined;
  if (agentId && !agent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <p className="p-6 text-muted">{t('agentEditor.notFound')}</p>
      </div>
    );
  }
  const template = agentId
    ? undefined
    : data?.templates.find((tpl) => tpl.key === searchParams.get('template'));
  const source = agent ?? template;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-10">
          {/* Keyed so a different agent or template starts a fresh form. */}
          <Editor
            key={agent?.id ?? template?.key ?? 'new'}
            agent={agent}
            initial={source ? formFrom(source) : EMPTY}
          />
        </div>
      </div>
    </div>
  );
}

function Editor({ agent, initial }: { agent: Agent | undefined; initial: Form }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const isAdmin = useMe().data?.role === 'admin';
  const chatModels = useModels().data?.chatModels ?? [];
  const save = useSaveAgent();
  const del = useDeleteAgent();
  const draft = useDraftAgent();
  const [form, setForm] = useState<Form>(initial);
  const [describe, setDescribe] = useState('');
  const [change, setChange] = useState('');
  const readOnly = agent !== undefined && !agent.editable;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const applyDraft = (d: AgentDraft) => {
    setForm((f) => ({
      ...f,
      name: d.name,
      emoji: d.emoji,
      description: d.description,
      instructions: d.instructions,
      examples: three(d.examples),
    }));
  };

  const write = () => {
    draft.mutate({ description: describe.trim() }, { onSuccess: applyDraft });
  };
  const revise = () => {
    draft.mutate(
      {
        description: describe.trim() || form.name,
        current: {
          name: form.name,
          emoji: form.emoji,
          description: form.description,
          instructions: form.instructions,
          examples: form.examples.filter((e) => e.trim() !== ''),
        },
        change: change.trim(),
      },
      {
        onSuccess: (d) => {
          applyDraft(d);
          setChange('');
        },
      },
    );
  };

  const complete =
    form.name.trim() !== '' && form.emoji.trim() !== '' && form.instructions.trim() !== '';
  const submit = (andTry: boolean) => {
    const body: SaveAgentRequest = {
      name: form.name.trim(),
      emoji: form.emoji.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      examples: form.examples.map((e) => e.trim()).filter((e) => e !== ''),
      modelId: form.modelId === '' ? null : form.modelId,
      think: form.think === 'default' ? null : form.think === 'on',
      webSearch: form.webSearch,
      images: form.images,
      family: isAdmin && form.family,
    };
    save.mutate(
      { ...(agent ? { id: agent.id } : {}), body },
      {
        onSuccess: (saved) => {
          void navigate(andTry ? `/?agent=${saved.id}` : '/');
        },
      },
    );
  };
  const remove = () => {
    if (!agent || !window.confirm(t('agentEditor.deleteConfirm'))) return;
    del.mutate(agent.id, {
      onSuccess: () => {
        void navigate('/');
      },
    });
  };

  return (
    <>
      {readOnly && <Alert tone="ok">{t('agentEditor.readOnly')}</Alert>}

      {!readOnly && (
        <Card className="space-y-3">
          <label htmlFor="agent-describe" className={label}>
            {t('agentEditor.describe')}
          </label>
          <textarea
            id="agent-describe"
            name="describe"
            rows={2}
            maxLength={500}
            value={describe}
            placeholder={t('agentEditor.describePlaceholder')}
            onChange={(e) => {
              setDescribe(e.target.value);
            }}
            className={input}
          />
          <Button disabled={draft.isPending || describe.trim().length < 3} onClick={write}>
            {t('agentEditor.write')}
          </Button>
          {form.instructions.trim() !== '' && (
            <div className="space-y-2 border-t border-line pt-3">
              <label htmlFor="agent-change" className={label}>
                {t('agentEditor.change')}
              </label>
              <div className="flex gap-2">
                <input
                  id="agent-change"
                  name="change"
                  value={change}
                  maxLength={300}
                  placeholder={t('agentEditor.changePlaceholder')}
                  onChange={(e) => {
                    setChange(e.target.value);
                  }}
                  className={input}
                />
                <Button
                  variant="secondary"
                  disabled={draft.isPending || change.trim() === ''}
                  onClick={revise}
                >
                  {t('agentEditor.apply')}
                </Button>
              </div>
            </div>
          )}
          {draft.isPending && (
            <p role="status" className="text-sm text-muted">
              {t('agentEditor.writing')}
            </p>
          )}
          {draft.isError && <Alert>{t('agentEditor.draftFailed')}</Alert>}
        </Card>
      )}

      <Card className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Field
              id="agent-name"
              name="name"
              label={t('agentEditor.name')}
              maxLength={40}
              value={form.name}
              disabled={readOnly}
              onChange={(e) => {
                set('name', e.target.value);
              }}
            />
          </div>
          <Field
            id="agent-emoji"
            name="emoji"
            label={t('agentEditor.emoji')}
            maxLength={8}
            className="w-24 text-center text-xl"
            value={form.emoji}
            disabled={readOnly}
            onChange={(e) => {
              set('emoji', e.target.value);
            }}
          />
        </div>
        <Field
          id="agent-description"
          name="description"
          label={t('agentEditor.description')}
          maxLength={120}
          value={form.description}
          disabled={readOnly}
          onChange={(e) => {
            set('description', e.target.value);
          }}
        />
        <div>
          <label htmlFor="agent-instructions" className={label}>
            {t('agentEditor.instructions')}
          </label>
          <textarea
            id="agent-instructions"
            name="instructions"
            rows={7}
            maxLength={AGENT_INSTRUCTIONS_MAX}
            value={form.instructions}
            disabled={readOnly}
            onChange={(e) => {
              set('instructions', e.target.value);
            }}
            className={input}
          />
          <p className="mt-1 flex justify-between gap-3 text-xs text-muted">
            <span>{t('agentEditor.instructionsHint')}</span>
            <span className="shrink-0 tabular-nums">
              {form.instructions.length}/{AGENT_INSTRUCTIONS_MAX}
            </span>
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className={label}>{t('agentEditor.examples')}</legend>
          {form.examples.map((value, i) => (
            <input
              key={i}
              id={`agent-example-${String(i)}`}
              name={`example${String(i)}`}
              aria-label={`${t('agentEditor.examples')} ${String(i + 1)}`}
              maxLength={140}
              value={value}
              disabled={readOnly}
              onChange={(e) => {
                const examples = [...form.examples] as Form['examples'];
                examples[i] = e.target.value;
                set('examples', examples);
              }}
              className={input}
            />
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="agent-model" className={label}>
              {t('agentEditor.model')}
            </label>
            <select
              id="agent-model"
              name="model"
              value={form.modelId}
              disabled={readOnly}
              onChange={(e) => {
                set('modelId', e.target.value);
              }}
              className={input}
            >
              <option value="">{t('agentEditor.modelDefault')}</option>
              {chatModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m, language)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="agent-think" className={label}>
              {t('agentEditor.think')}
            </label>
            <select
              id="agent-think"
              name="think"
              value={form.think}
              disabled={readOnly}
              onChange={(e) => {
                const v = e.target.value;
                set('think', v === 'on' || v === 'off' ? v : 'default');
              }}
              className={input}
            >
              <option value="default">{t('agentEditor.thinkDefault')}</option>
              <option value="on">{t('agentEditor.thinkOn')}</option>
              <option value="off">{t('agentEditor.thinkOff')}</option>
            </select>
          </div>
        </div>
        {(
          [
            ['webSearch', t('agentEditor.webSearch')],
            ['images', t('agentEditor.images')],
            ...(isAdmin ? ([['family', t('agentEditor.shareFamily')]] as const) : []),
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              name={key}
              checked={form[key]}
              disabled={readOnly}
              onChange={(e) => {
                set(key, e.target.checked);
              }}
              className="h-5 w-5 accent-[var(--forest)]"
            />
            {text}
          </label>
        ))}
        {!readOnly && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              disabled={save.isPending || !complete}
              onClick={() => {
                submit(false);
              }}
            >
              {t('agentEditor.save')}
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending || !complete}
              onClick={() => {
                submit(true);
              }}
            >
              {t('agentEditor.saveTry')}
            </Button>
            {agent && (
              <Button
                variant="danger"
                disabled={del.isPending}
                onClick={remove}
                className="ml-auto"
              >
                {t('agentEditor.delete')}
              </Button>
            )}
          </div>
        )}
        {(save.isError || del.isError) && <Alert>{t('error.generic')}</Alert>}
      </Card>
    </>
  );
}
