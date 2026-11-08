import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Welcome } from './Welcome.tsx';
import { GetHub } from './GetHub.tsx';
import { Scan } from './Scan.tsx';
import { Offline } from './Offline.tsx';
import { Outdated } from './Outdated.tsx';
import { ConfirmHub } from './ConfirmHub.tsx';
import { HubList } from './HubList.tsx';
import type { StoredHub } from './hubs.ts';

describe('Welcome', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls onScan when the Scan button is clicked', () => {
    const onScan = vi.fn();
    const onPasteLink = vi.fn();
    const onGetHub = vi.fn();

    render(
      <Welcome
        onScan={onScan}
        onPasteLink={onPasteLink}
        onGetHub={onGetHub}
        onPhoneMode={() => undefined}
        language="en"
      />,
    );

    const scanButton = screen.getByText('Scan the code');
    fireEvent.click(scanButton);
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('calls onGetHub when the I dont have Hemmia at home yet button is clicked', () => {
    const onScan = vi.fn();
    const onPasteLink = vi.fn();
    const onGetHub = vi.fn();

    render(
      <Welcome
        onScan={onScan}
        onPasteLink={onPasteLink}
        onGetHub={onGetHub}
        onPhoneMode={() => undefined}
        language="en"
      />,
    );

    const getHubButton = screen.getByText("I don't have Hemmia at home yet");
    fireEvent.click(getHubButton);
    expect(onGetHub).toHaveBeenCalledTimes(1);
  });

  it('disables Continue button when link is empty', () => {
    const onScan = vi.fn();
    const onPasteLink = vi.fn();
    const onGetHub = vi.fn();

    render(
      <Welcome
        onScan={onScan}
        onPasteLink={onPasteLink}
        onGetHub={onGetHub}
        onPhoneMode={() => undefined}
        language="en"
      />,
    );

    const continueButton = screen.getByText('Continue');
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onPasteLink with trimmed text when Continue is clicked', () => {
    const onScan = vi.fn();
    const onPasteLink = vi.fn();
    const onGetHub = vi.fn();

    render(
      <Welcome
        onScan={onScan}
        onPasteLink={onPasteLink}
        onGetHub={onGetHub}
        onPhoneMode={() => undefined}
        language="en"
      />,
    );

    const input = screen.getByLabelText('Or paste the link');
    fireEvent.change(input, { target: { value: '  https://x.example/j#1  ' } });

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(onPasteLink).toHaveBeenCalledWith('https://x.example/j#1');
  });
});

describe('GetHub', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls onShareDownloadLink when the Send link button is clicked', () => {
    const onShareDownloadLink = vi.fn();
    const onBack = vi.fn();

    render(<GetHub onShareDownloadLink={onShareDownloadLink} onBack={onBack} language="en" />);

    const sendButton = screen.getByText('Send the link to my computer');
    fireEvent.click(sendButton);
    expect(onShareDownloadLink).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when the Back button is clicked', () => {
    const onShareDownloadLink = vi.fn();
    const onBack = vi.fn();

    render(<GetHub onShareDownloadLink={onShareDownloadLink} onBack={onBack} language="en" />);

    const backButton = screen.getByText('‹ Back');
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Scan', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows error text when error is provided', () => {
    const onPasteLink = vi.fn();
    const onBack = vi.fn();

    render(<Scan onPasteLink={onPasteLink} onBack={onBack} error="Invalid link" language="en" />);

    expect(screen.getByRole('alert').textContent).toContain('Invalid link');
  });

  it('does not show error text when error is null', () => {
    const onPasteLink = vi.fn();
    const onBack = vi.fn();

    render(<Scan onPasteLink={onPasteLink} onBack={onBack} error={null} language="en" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Offline', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows hub name in the title', () => {
    const onRetry = vi.fn();
    const onSwitch = vi.fn();

    const hub: StoredHub = {
      hubHost: 'example.com',
      name: 'My Hub',
      lastReachedAt: Date.now(),
    };

    render(
      <Offline hub={hub} onRetry={onRetry} onSwitch={onSwitch} retrying={false} language="en" />,
    );

    expect(screen.getByText("My Hub isn't reachable")).toBeDefined();
  });

  it('disables Try again button when retrying', () => {
    const onRetry = vi.fn();
    const onSwitch = vi.fn();

    const hub: StoredHub = {
      hubHost: 'example.com',
      name: 'My Hub',
      lastReachedAt: Date.now(),
    };

    render(
      <Offline hub={hub} onRetry={onRetry} onSwitch={onSwitch} retrying={true} language="en" />,
    );

    const tryAgainButton = screen.getByText('Try again');
    expect((tryAgainButton as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('HubList', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists hubs in the correct order', () => {
    const onOpenHub = vi.fn();
    const onRemove = vi.fn();
    const onAdd = vi.fn();

    const hubs: StoredHub[] = [
      { hubHost: 'hub1.example.com', name: 'First Hub', lastReachedAt: 1234567890 },
      { hubHost: 'hub2.example.com', name: 'Second Hub', lastReachedAt: 1234567891 },
    ];

    render(
      <HubList hubs={hubs} onOpenHub={onOpenHub} onRemove={onRemove} onAdd={onAdd} language="en" />,
    );

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['First Hubhub1.example.com', 'Second Hubhub2.example.com']);
  });

  it('calls onOpenHub with the correct hubHost', () => {
    const onOpenHub = vi.fn();
    const onRemove = vi.fn();
    const onAdd = vi.fn();

    const hubs: StoredHub[] = [
      { hubHost: 'hub1.example.com', name: 'First Hub', lastReachedAt: 1234567890 },
    ];

    render(
      <HubList hubs={hubs} onOpenHub={onOpenHub} onRemove={onRemove} onAdd={onAdd} language="en" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^First Hub/ }));
    expect(onOpenHub).toHaveBeenCalledWith('hub1.example.com');
  });

  it('calls onRemove with the correct hubHost', () => {
    const onOpenHub = vi.fn();
    const onRemove = vi.fn();
    const onAdd = vi.fn();

    const hubs: StoredHub[] = [
      { hubHost: 'hub1.example.com', name: 'First Hub', lastReachedAt: 1234567890 },
    ];

    render(
      <HubList hubs={hubs} onOpenHub={onOpenHub} onRemove={onRemove} onAdd={onAdd} language="en" />,
    );

    const removeButton = screen.getByLabelText('Remove First Hub');
    fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledWith('hub1.example.com');
  });

  it('shows empty list message when no hubs', () => {
    const onOpenHub = vi.fn();
    const onRemove = vi.fn();
    const onAdd = vi.fn();

    render(
      <HubList hubs={[]} onOpenHub={onOpenHub} onRemove={onRemove} onAdd={onAdd} language="en" />,
    );

    expect(screen.getByText('No hub saved on this phone yet.')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('phone mode entry points', () => {
  it('Welcome offers "Just me, on this phone"', () => {
    const onPhoneMode = vi.fn();
    render(
      <Welcome
        onScan={vi.fn()}
        onPasteLink={vi.fn()}
        onGetHub={vi.fn()}
        onPhoneMode={onPhoneMode}
        language="en"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Just me, on this phone/ }));
    expect(onPhoneMode).toHaveBeenCalledTimes(1);
  });

  it('HubList shows "On this phone" first only when phone mode is set up', () => {
    const onPhoneMode = vi.fn();
    const hubs: StoredHub[] = [{ hubHost: 'home.tail1.ts.net', name: 'Home', lastReachedAt: 1 }];
    const { container, unmount } = render(
      <HubList
        hubs={[]}
        onOpenHub={vi.fn()}
        onRemove={vi.fn()}
        onAdd={vi.fn()}
        onPhoneMode={onPhoneMode}
        language="en"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /On this phone/ }));
    expect(onPhoneMode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No hub saved on this phone yet.')).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
    unmount();
    render(
      <HubList hubs={hubs} onOpenHub={vi.fn()} onRemove={vi.fn()} onAdd={vi.fn()} language="en" />,
    );
    expect(screen.queryByRole('button', { name: /On this phone/ })).toBeNull();
  });
});

describe('Outdated', () => {
  afterEach(() => {
    cleanup();
  });
  const hub: StoredHub = { hubHost: 'home.tail1.ts.net', name: 'Home', lastReachedAt: 1 };

  it('app too old: links to the store, can switch hub', () => {
    const onSwitch = vi.fn();
    render(
      <Outdated
        hub={hub}
        side="app"
        storeUrl="https://store.example/hemmia"
        onRetry={() => undefined}
        onSwitch={onSwitch}
        language="en"
      />,
    );
    expect(screen.getByText('Please update the Hemmia app')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Update the app' }).getAttribute('href')).toBe(
      'https://store.example/hemmia',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to another hub' }));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('hub too old: names the hub and offers to try again', () => {
    const onRetry = vi.fn();
    render(
      <Outdated
        hub={hub}
        side="hub"
        storeUrl="https://store.example/hemmia"
        onRetry={onRetry}
        onSwitch={() => undefined}
        language="de"
      />,
    );
    expect(screen.getByText('Home braucht ein Update')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Welcome legal links', () => {
  afterEach(() => {
    cleanup();
  });

  it('links the privacy policy and terms in the phone language', () => {
    render(
      <Welcome
        onScan={vi.fn()}
        onPasteLink={vi.fn()}
        onGetHub={vi.fn()}
        onPhoneMode={vi.fn()}
        language="de"
      />,
    );
    expect(screen.getByRole('link', { name: 'Datenschutzerklärung' }).getAttribute('href')).toBe(
      'https://hemmia.app/de/legal/privacy/',
    );
    expect(screen.getByRole('link', { name: 'Nutzungsbedingungen' }).getAttribute('href')).toBe(
      'https://hemmia.app/de/legal/terms/',
    );
  });
});

describe('ConfirmHub', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the full address and adds only on confirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmHub
        hubHost="k7m2pq9xz4hr.h.hemmia.app"
        onConfirm={onConfirm}
        onCancel={onCancel}
        language="en"
      />,
    );
    expect(screen.getByTestId('confirm-host').textContent).toBe('k7m2pq9xz4hr.h.hemmia.app');
    expect(screen.queryByText(/Tailscale/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add and open' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('says when the address is a Tailscale name', () => {
    render(
      <ConfirmHub
        hubHost="home.tail1.ts.net"
        onConfirm={() => undefined}
        onCancel={() => undefined}
        language="de"
      />,
    );
    expect(screen.getByText(/Tailscale-Adresse/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Hinzufügen und öffnen' })).toBeDefined();
  });
});
