import { QrCode } from '../components/QrCode.tsx';
import { DevicesSection } from '../components/DevicesSection.tsx';
import { SignInDevice } from '../components/SignInDevice.tsx';
import { useCallback, useEffect, useState, type ReactNode, type SubmitEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../auth/errorMessage.ts';
import { ModelsTab } from '../components/ModelsTab.tsx';
import { DailySection } from '../components/DailySection.tsx';
import { ProfileSection } from '../components/ProfileSection.tsx';
import { PageHeader } from '../components/layout.tsx';
import { disablePush, enablePush, pushState, type PushState } from '../push/push.ts';
import { useMe } from '../auth/hooks.ts';
import { useModels } from '../chat/hooks.ts';
import { useI18n } from '../i18n/index.tsx';
import {
  useAdminUsers,
  useChangePassword,
  useCreateInvite,
  useAdminInvites,
  useDeleteMe,
  useDeleteUser,
  useRevokeInvite,
  useEndSession,
  useLogoutAll,
  usePause,
  useSessions,
  useUpdateUser,
} from '../settings/hooks.ts';
import { SystemPanel } from '../components/SystemPanel.tsx';
import { FeedbackBox } from '../components/FeedbackBox.tsx';
import { native } from '../native/bridge.ts';
import { ApiError } from '../api/client.ts';

const card = 'rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(23,35,31,0.04)]';
const input =
  'min-h-12 w-full rounded-xl border border-line bg-paper px-3.5 text-base text-ink focus:border-forest focus:outline-none';
const smallButton = 'min-h-11 rounded-xl px-3 text-sm font-medium text-ink hover:bg-champagne';
const primaryButton =
  'min-h-11 rounded-xl bg-forest px-4 font-semibold text-on-forest hover:bg-forest-hover disabled:opacity-45';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PasswordForm() {
  const { t } = useI18n();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (next !== repeat) {
      setMessage({ ok: false, text: t('invite.mismatch') });
      return;
    }
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setRepeat('');
          setMessage({ ok: true, text: t('settings.passwordChanged') });
        },
        onError: (err) => {
          setMessage({ ok: false, text: errorMessage(err, t) });
        },
      },
    );
  };

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    auto: string,
  ) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={auto}
        required
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
        className={input}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {field(
        'current-password',
        t('settings.currentPassword'),
        current,
        setCurrent,
        'current-password',
      )}
      {field('new-password', t('settings.newPassword'), next, setNext, 'new-password')}
      {field('repeat-password', t('settings.confirmPassword'), repeat, setRepeat, 'new-password')}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`rounded-xl px-3.5 py-2.5 text-sm ${message.ok ? 'bg-champagne text-ok' : 'bg-danger-soft text-danger'}`}
        >
          {message.text}
        </p>
      )}
      <button type="submit" disabled={change.isPending} className={primaryButton}>
        {t('settings.changePassword')}
      </button>
    </form>
  );
}

function Sessions() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const sessions = useSessions();
  const end = useEndSession();
  const logoutAll = useLogoutAll();

  return (
    <>
      <ul className="mb-4 divide-y divide-line">
        {sessions.data?.sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate">
                {s.deviceLabel || t('settings.unknownDevice')}
                {s.current && (
                  <span className="ml-2 rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-on-champagne">
                    {t('settings.thisDevice')}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {t('settings.lastSeen', { when: new Date(s.lastSeenAt).toLocaleString(language) })}
              </p>
            </div>
            {!s.current && (
              <button
                type="button"
                className={smallButton}
                onClick={() => {
                  end.mutate(s.id);
                }}
              >
                {t('settings.signOutDevice')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="min-h-11 rounded-xl border border-line bg-card px-4 font-semibold text-danger hover:bg-danger-soft"
        onClick={() => {
          if (!window.confirm(t('settings.signOutEverywhereConfirm'))) return;
          logoutAll.mutate(undefined, {
            onSettled: () => {
              void navigate('/login', { replace: true });
            },
          });
        }}
      >
        {t('settings.signOutEverywhere')}
      </button>
    </>
  );
}

/** Asks for the passphrase before an account is deleted for good. */
function DeleteConfirm({
  id,
  explain,
  action,
  pending,
  onDelete,
  onCancel,
}: {
  id: string;
  explain: string;
  action: string;
  pending: boolean;
  onDelete: (password: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-2 w-full space-y-3 rounded-xl bg-danger-soft p-4"
      onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        onDelete(password).catch((err: unknown) => {
          setError(errorMessage(err, t));
        });
      }}
    >
      <p className="text-sm">{explain}</p>
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">
          {t('account.deletePassword')}
        </label>
        <input
          id={id}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          className={input}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || password === ''}
          className="min-h-11 rounded-xl border border-danger bg-card px-4 font-semibold text-danger disabled:opacity-45"
        >
          {action}
        </button>
        <button type="button" className={smallButton} onClick={onCancel}>
          {t('account.cancel')}
        </button>
      </div>
    </form>
  );
}

function DeleteMyAccount({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const del = useDeleteMe();
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {t('account.deleteIntro')}
        {isAdmin && ` ${t('account.deleteLastAdmin')}`}
      </p>
      {open ? (
        <DeleteConfirm
          id="delete-me-password"
          explain={t('account.deleteConfirm')}
          action={t('account.deleteFinal')}
          pending={del.isPending}
          onCancel={() => {
            setOpen(false);
          }}
          onDelete={async (password) => {
            await del.mutateAsync(password);
            void navigate('/login', { replace: true });
          }}
        />
      ) : (
        <button
          type="button"
          className="min-h-11 rounded-xl border border-line bg-card px-4 font-semibold text-danger hover:bg-danger-soft"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t('account.delete')}
        </button>
      )}
    </>
  );
}

function Admin({ myId }: { myId: string }) {
  const { t, language } = useI18n();
  const users = useAdminUsers();
  const createInvite = useCreateInvite();
  const invites = useAdminInvites();
  const revokeInvite = useRevokeInvite();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [devicesOf, setDevicesOf] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [asAdmin, setAsAdmin] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [copied, setCopied] = useState(false);
  // An admin invite needs the passphrase unless this session started with it just now.
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const invite = createInvite.data;

  return (
    <Section title={t('admin.title')}>
      <p className="mb-4 text-sm text-muted">{t('admin.noContentNote')}</p>
      <div className="mb-4 space-y-2">
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            name="inviteAdmin"
            type="checkbox"
            checked={asAdmin}
            onChange={(e) => {
              setAsAdmin(e.target.checked);
            }}
          />
          {t('admin.inviteAdmin')}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            name="inviteRestricted"
            type="checkbox"
            checked={restricted}
            onChange={(e) => {
              setRestricted(e.target.checked);
            }}
          />
          {t('admin.inviteRestricted')}
        </label>
        <button
          type="button"
          className={primaryButton}
          disabled={createInvite.isPending || (asAdmin && needsPassword && password === '')}
          onClick={() => {
            setCopied(false);
            createInvite.mutate(
              {
                role: asAdmin ? 'admin' : 'member',
                restricted,
                ...(asAdmin && needsPassword ? { password } : {}),
              },
              {
                onSuccess: () => {
                  setPassword('');
                  setNeedsPassword(false);
                },
                onError: (err) => {
                  if (err instanceof ApiError && err.code === 'invalid_credentials') {
                    setNeedsPassword(true);
                  }
                },
              },
            );
          }}
        >
          {t('admin.createInvite')}
        </button>
        {asAdmin && needsPassword && (
          <label className="flex flex-col gap-1 text-sm">
            {t('admin.invitePassword')}
            <input
              name="invitePassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              className={input}
            />
          </label>
        )}
        {invite && (
          <div className="space-y-2">
            {(invite.shareLink ?? invite.directLink) ? (
              <div className="flex flex-col items-start gap-2">
                <QrCode
                  value={invite.shareLink ?? invite.directLink ?? ''}
                  label={t('invite.qrLabel')}
                />
                <p className="text-sm">{t('invite.scanOrSend')}</p>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => {
                    const url = invite.shareLink ?? invite.directLink ?? '';
                    if (native) {
                      void native.share(url);
                    } else if (typeof navigator.share === 'function') {
                      void navigator.share({ url }).catch(() => undefined);
                    } else {
                      void navigator.clipboard.writeText(url).then(() => {
                        setCopied(true);
                      });
                    }
                  }}
                >
                  {t('invite.send')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('invite.turnOnRemote')}</p>
            )}
            <div className="flex gap-2">
              <input
                name="inviteLink"
                readOnly
                aria-label={t('admin.createInvite')}
                value={invite.shareLink ?? invite.directLink ?? invite.link}
                onFocus={(e) => {
                  e.target.select();
                }}
                className={`${input} font-mono text-sm`}
              />
              <button
                type="button"
                className={smallButton}
                onClick={() => {
                  navigator.clipboard
                    .writeText(invite.shareLink ?? invite.directLink ?? invite.link)
                    .then(() => {
                      setCopied(true);
                    })
                    .catch(() => undefined);
                }}
              >
                {copied ? t('common.copied') : t('common.copy')}
              </button>
            </div>
            <p className="text-sm text-muted">
              {t('admin.inviteCreated', {
                date: new Date(invite.expiresAt).toLocaleDateString(language),
              })}
            </p>
          </div>
        )}
      </div>

      {invites.data && invites.data.invites.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold">{t('admin.openInvites')}</h3>
          <ul className="mb-4 divide-y divide-line">
            {invites.data.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  {t('admin.inviteRow', {
                    role: t(i.role === 'admin' ? 'admin.role.admin' : 'admin.role.member'),
                    date: new Date(i.expiresAt).toLocaleDateString(language),
                  })}
                  {i.restricted && ` · ${t('admin.restricted')}`}
                </span>
                <button
                  type="button"
                  className={smallButton}
                  disabled={revokeInvite.isPending}
                  onClick={() => {
                    revokeInvite.mutate(i.id);
                  }}
                >
                  {t('admin.inviteRevoke')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mb-2 text-sm font-semibold">{t('admin.users')}</h3>
      <ul className="divide-y divide-line">
        {users.data?.users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-medium">{u.username}</span>
            <span className="text-sm text-muted">
              {t(u.role === 'admin' ? 'admin.role.admin' : 'admin.role.member')}
            </span>
            {u.restricted && (
              <span className="rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-on-champagne">
                {t('admin.restricted')}
              </span>
            )}
            {u.disabledAt !== null && (
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                {t('admin.disabled')}
              </span>
            )}
            <span className="ml-auto flex gap-1">
              {u.id !== myId && (
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => {
                    updateUser.mutate({ id: u.id, disabled: u.disabledAt === null });
                  }}
                >
                  {u.disabledAt === null ? t('admin.disable') : t('admin.enable')}
                </button>
              )}
              <button
                type="button"
                className={smallButton}
                onClick={() => {
                  updateUser.mutate({ id: u.id, restricted: !u.restricted });
                }}
              >
                {u.restricted ? t('admin.unrestrict') : t('admin.restrict')}
              </button>
              <button
                type="button"
                className={smallButton}
                aria-expanded={devicesOf === u.id}
                onClick={() => {
                  setDevicesOf(devicesOf === u.id ? null : u.id);
                }}
              >
                {t('devices.title')}
              </button>
              {u.id !== myId && (
                <button
                  type="button"
                  className={`${smallButton} text-danger`}
                  aria-expanded={deleting === u.id}
                  onClick={() => {
                    setDeleting(deleting === u.id ? null : u.id);
                  }}
                >
                  {t('admin.deleteUser')}
                </button>
              )}
            </span>
            {deleting === u.id && (
              <DeleteConfirm
                id={`delete-${u.id}`}
                explain={t('admin.deleteUserConfirm', { name: u.username })}
                action={t('admin.deleteUserFinal', { name: u.username })}
                pending={deleteUser.isPending}
                onCancel={() => {
                  setDeleting(null);
                }}
                onDelete={async (password) => {
                  await deleteUser.mutateAsync({ id: u.id, password });
                  setDeleting(null);
                }}
              />
            )}
            {devicesOf === u.id && (
              <div className="w-full pt-2">
                <DevicesSection userId={u.id} userName={u.username} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Notifications() {
  const { t } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [working, setWorking] = useState(false);
  /** Turning on ended up off (no push address from the phone): say so instead of flipping back. */
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  const run = (fn: () => Promise<PushState>, turningOn: boolean) => {
    setWorking(true);
    setFailed(false);
    void fn()
      .catch(() => pushState())
      .then((next) => {
        setState(next);
        setFailed(turningOn && next === 'off');
      })
      .finally(() => {
        setWorking(false);
      });
  };
  if (state === null) return null;
  const note = {
    unsupported: t('notify.unsupported'),
    'needs-home-screen': t('notify.homeScreen'),
    denied: t('notify.denied'),
    off: null,
    on: t('notify.isOn'),
  }[state];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('notify.hint')}</p>
      {note && <p className="text-sm">{note}</p>}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t('notify.failed')}
        </p>
      )}
      {(state === 'off' || state === 'on') && (
        <button
          type="button"
          disabled={working}
          onClick={() => {
            run(state === 'on' ? disablePush : enablePush, state !== 'on');
          }}
          className={
            state === 'on'
              ? smallButton + ' self-start border border-line'
              : primaryButton + ' self-start'
          }
        >
          {state === 'on' ? t('notify.turnOff') : t('notify.turnOn')}
        </button>
      )}
    </div>
  );
}

function PauseSwitch() {
  const { t } = useI18n();
  const paused = useModels().data?.paused === true;
  const pause = usePause();
  return (
    <label className="flex min-h-12 items-center justify-between gap-4">
      <span className="text-sm text-muted">{t('admin.pauseHint')}</span>
      <input
        name="paused"
        type="checkbox"
        role="switch"
        aria-label={t('admin.pause')}
        checked={paused}
        disabled={pause.isPending}
        onChange={(e) => {
          pause.mutate(e.target.checked);
        }}
        className="h-6 w-6 shrink-0 accent-[var(--forest)]"
      />
    </label>
  );
}

type Tab = 'account' | 'models' | 'family' | 'system';
const ADMIN_TABS: readonly Tab[] = ['account', 'models', 'family', 'system'];
/** Everyone has their default model and own cloud keys under Models. */
const MEMBER_TABS: readonly Tab[] = ['account', 'models'];
const LAST_TAB = 'kchat.settingsTab';

function readLastTab(): string | null {
  try {
    return localStorage.getItem(LAST_TAB);
  } catch {
    return null;
  }
}

export function SettingsPage() {
  const { t } = useI18n();
  const me = useMe().data;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Back to where the user came from (usually a chat); the start page if Settings was opened directly.
  const back = useCallback(() => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/', { replace: true });
  }, [location.key, navigate]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) back();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [back]);

  if (!me) return null;
  const isAdmin = me.role === 'admin';
  const tabs = isAdmin ? ADMIN_TABS : MEMBER_TABS;
  const wanted = searchParams.get('tab') ?? readLastTab();
  const tab: Tab = tabs.includes(wanted as Tab) ? (wanted as Tab) : 'account';
  const chooseTab = (next: Tab) => {
    try {
      localStorage.setItem(LAST_TAB, next);
    } catch {
      // private mode: the tab just isn't remembered
    }
    setSearchParams({ tab: next }, { replace: true });
  };
  const tabLabel: Record<Tab, string> = {
    account: t('settings.tabAccount'),
    family: t('settings.tabFamily'),
    system: t('settings.tabSystem'),
    models: t('settings.tabModels'),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader onBack={back}>
        <h1 className="font-display text-[19px] font-semibold">{t('settings.title')}</h1>
      </PageHeader>
      <div className="border-b border-line bg-paper px-4">
        <div
          role="tablist"
          aria-label={t('settings.title')}
          className="no-scrollbar mx-auto flex max-w-2xl gap-1 overflow-x-auto py-2"
        >
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="settings-panel"
              onClick={() => {
                chooseTab(id);
              }}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
                tab === id
                  ? 'bg-forest text-on-forest'
                  : 'text-muted hover:bg-champagne hover:text-ink'
              }`}
            >
              {tabLabel[id]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-10"
        >
          {tab === 'account' && (
            <>
              {!me.restricted && (
                <Section title={t('profile.title')}>
                  <ProfileSection />
                </Section>
              )}
              <Section title={t('daily.title')}>
                <DailySection />
              </Section>
              <Section title={t('settings.notifications')}>
                <Notifications />
              </Section>
              <Section title={t('settings.password')}>
                <PasswordForm />
              </Section>
              <Section title={t('signin.title')}>
                <SignInDevice />
              </Section>
              <Section title={t('devices.title')}>
                <DevicesSection />
              </Section>
              {native && (
                <Section title={t('native.switchTitle')}>
                  <p className="mb-3 text-sm text-muted">{t('native.switchIntro')}</p>
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => {
                      native?.switchHub();
                    }}
                  >
                    {t('native.switch')}
                  </button>
                </Section>
              )}
              <Section title={t('settings.sessions')}>
                <Sessions />
              </Section>
              <Section title={t('account.deleteTitle')}>
                <DeleteMyAccount isAdmin={me.role === 'admin'} />
              </Section>
            </>
          )}
          {tab === 'family' && <Admin myId={me.id} />}
          {tab === 'system' && (
            <>
              <Section title={t('system.title')}>
                <SystemPanel />
              </Section>
              <Section title={t('admin.pause')}>
                <PauseSwitch />
              </Section>
              <div className="flex flex-col px-1">
                <FeedbackBox page="settings/system" />
              </div>
            </>
          )}
          {tab === 'models' && (
            <>
              <ModelsTab isAdmin={isAdmin} />
              {isAdmin && (
                <div className="flex flex-col px-1">
                  <FeedbackBox page="settings/models" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
