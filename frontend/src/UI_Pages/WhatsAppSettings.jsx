import { useEffect, useMemo, useState } from 'react';
import {
  getWhatsAppSettings,
  testWhatsAppConnection,
  updateWhatsAppSettings,
} from '../api';

function getInitialForm(settings) {
  return {
    phoneNumberId: settings?.phoneNumberId ?? '',
    wabaId: settings?.wabaId ?? '',
    accessToken: '',
    isEnabled: settings?.isEnabled === true,
  };
}

function resolveCallbackUrl(value) {
  if (!value) return `${window.location.origin}/api/webhooks/whatsapp`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith('/') ? value : `/${value}`}`;
}

function Spinner() {
  return <span className="whatsapp-settings-spinner" aria-hidden="true" />;
}

export default function WhatsAppSettings({ businessId, businessName }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(getInitialForm());
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(Boolean(businessId));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      if (!businessId) {
        setSettings(null);
        setForm(getInitialForm());
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      setNotice('');
      setTestResult(null);

      try {
        const response = await getWhatsAppSettings(businessId);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load WhatsApp settings.');

        if (active) {
          setSettings(result.data ?? null);
          setForm(getInitialForm(result.data));
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load WhatsApp settings.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSettings();
    return () => { active = false; };
  }, [businessId]);

  const callbackUrl = useMemo(
    () => resolveCallbackUrl(settings?.webhookCallbackUrl),
    [settings?.webhookCallbackUrl],
  );
  const verifyToken = settings?.webhookVerifyToken ?? '';
  const isConnected = Boolean(
    (testResult?.success || settings?.status === 'verified') &&
    form.isEnabled,
  );
  const isConfigured = Boolean(settings?.hasToken && settings?.phoneNumberId);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice('');
    setTestResult(null);
  }

  async function handleTestConnection(event) {
    event.preventDefault();
    if (!businessId) return;

    setTesting(true);
    setError('');
    setNotice('');
    setTestResult(null);

    try {
      const response = await testWhatsAppConnection(businessId, {
        phoneNumberId: form.phoneNumberId,
        ...(form.accessToken ? { accessToken: form.accessToken } : {}),
      });
      const result = await response.json();
      if (!response.ok || result.data?.success !== true) {
        throw new Error(result.data?.error || result.error || 'WhatsApp connection could not be verified.');
      }

      setTestResult(result.data);
      setNotice('Connection verified successfully.');
      setSettings((current) => ({ ...current, status: 'verified' }));
    } catch (testError) {
      setTestResult({ success: false });
      setError(testError.message || 'WhatsApp connection could not be verified.');
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    if (!businessId) return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const response = await updateWhatsAppSettings(businessId, {
        phoneNumberId: form.phoneNumberId.trim(),
        wabaId: form.wabaId.trim(),
        ...(form.accessToken ? { accessToken: form.accessToken } : {}),
        isEnabled: form.isEnabled,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save WhatsApp settings.');

      setSettings((current) => ({ ...current, ...result.data }));
      setForm((current) => ({ ...current, accessToken: '' }));
      setNotice('WhatsApp settings saved successfully.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save WhatsApp settings.');
    } finally {
      setSaving(false);
    }
  }

  async function copyValue(field, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(''), 1600);
    } catch {
      setError('Copy failed. Please copy the value manually.');
    }
  }

  if (!businessId) {
    return (
      <section className="whatsapp-settings-page">
        <div className="whatsapp-settings-empty">
          <span className="whatsapp-settings-kicker">INTEGRATIONS</span>
          <h2>Select a business to configure WhatsApp.</h2>
          <p>Platform admins can choose a business from the workspace selector above.</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="whatsapp-settings-page">
        <div className="whatsapp-settings-loading"><Spinner /> Loading WhatsApp settings...</div>
      </section>
    );
  }

  return (
    <section className="whatsapp-settings-page">
      <div className="whatsapp-settings-hero">
        <div>
          <span className="whatsapp-settings-kicker">INTEGRATIONS / WHATSAPP</span>
          <h2>WhatsApp Cloud API</h2>
          <p>Connect {businessName || 'this business'} to send customer messages through Meta’s verified WhatsApp channel.</p>
        </div>
        <span className="whatsapp-settings-live-pill">PHASE 3</span>
      </div>

      <div className={`whatsapp-settings-status ${isConnected ? 'is-connected' : ''}`}>
        <div className="whatsapp-settings-status-icon">{isConnected ? '🟢' : '⚪'}</div>
        <div>
          <strong>
            {isConnected
              ? `Connected: ${testResult?.displayPhoneNumber || settings?.displayPhoneNumber || 'WhatsApp number verified'}`
              : isConfigured && form.isEnabled
                ? 'Configured — connection verification recommended'
                : 'Simulated / Test Mode'}
          </strong>
          <span>
            {isConnected ? 'Live Mode' : 'Messages are safely simulated until WhatsApp is connected and enabled.'}
          </span>
        </div>
        <span className="whatsapp-settings-status-tag">{isConnected ? 'LIVE MODE' : 'SAFE SIMULATION'}</span>
      </div>

      {error && <div className="whatsapp-settings-alert is-error" role="alert">{error}</div>}
      {notice && <div className="whatsapp-settings-alert is-success" role="status">{notice}</div>}

      <div className="whatsapp-settings-grid">
        <form className="whatsapp-settings-card" onSubmit={handleSaveSettings}>
          <div className="whatsapp-settings-card-heading">
            <div>
              <span className="whatsapp-settings-section-label">CREDENTIALS</span>
              <h3>Clinic connection</h3>
            </div>
            <span className="whatsapp-settings-card-icon">WA</span>
          </div>

          <label className="whatsapp-settings-field">
            <span>WhatsApp Phone Number ID</span>
            <input value={form.phoneNumberId} onChange={(event) => updateField('phoneNumberId', event.target.value)} placeholder="Your Meta phone number ID" />
          </label>

          <label className="whatsapp-settings-field">
            <span>WhatsApp Business Account (WABA) ID</span>
            <input value={form.wabaId} onChange={(event) => updateField('wabaId', event.target.value)} placeholder="Your WABA ID" />
          </label>

          <label className="whatsapp-settings-field">
            <span>Permanent System User Access Token</span>
            <div className="whatsapp-settings-token-input">
              <input
                type={showToken ? 'text' : 'password'}
                value={form.accessToken}
                onChange={(event) => updateField('accessToken', event.target.value)}
                placeholder={settings?.hasToken ? '••••••••••••' : 'Paste token securely'}
                autoComplete="new-password"
              />
              <button type="button" className="whatsapp-settings-inline-button" onClick={() => setShowToken((current) => !current)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            {settings?.hasToken && <small>Saved token is protected. Leave blank to keep it unchanged.</small>}
          </label>

          <label className="whatsapp-settings-toggle">
            <input type="checkbox" checked={form.isEnabled} onChange={(event) => updateField('isEnabled', event.target.checked)} />
            <span className="whatsapp-settings-switch" aria-hidden="true" />
            <span><strong>Enable WhatsApp Sending</strong><small>Use WhatsApp for eligible outbound messages.</small></span>
          </label>

          <div className="whatsapp-settings-actions">
            <button type="button" className="whatsapp-settings-secondary" onClick={handleTestConnection} disabled={testing || saving}>
              {testing && <Spinner />}{testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button type="submit" className="whatsapp-settings-primary" disabled={saving || testing}>
              {saving && <Spinner />}{saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {testResult?.success && (
            <div className="whatsapp-settings-test-result">
              <strong>Verified: {testResult.verifiedName || 'WhatsApp Business account'}</strong>
              <span>{testResult.displayPhoneNumber || 'Phone number verified by Meta.'}</span>
            </div>
          )}
        </form>

        <div className="whatsapp-settings-card whatsapp-settings-webhook-card">
          <div className="whatsapp-settings-card-heading">
            <div>
              <span className="whatsapp-settings-section-label">WEBHOOK SETUP</span>
              <h3>Receive customer replies</h3>
            </div>
            <span className="whatsapp-settings-card-icon">↗</span>
          </div>
          <p className="whatsapp-settings-muted">Copy these values into your Meta App Dashboard to receive delivery events and replies.</p>

          {[
            ['callback', 'Webhook Callback URL', callbackUrl],
            ['verify', 'Webhook Verify Token', verifyToken],
          ].map(([field, label, value]) => (
            <div className="whatsapp-settings-copy-row" key={field}>
              <div><span>{label}</span><code>{value || 'Unavailable'}</code></div>
              <button type="button" onClick={() => copyValue(field, value)} disabled={!value}>{copiedField === field ? 'Copied' : 'Copy'}</button>
            </div>
          ))}

          <ol className="whatsapp-settings-checklist">
            <li><span>1</span><p>Paste the Callback URL and Verify Token in Meta App Dashboard.</p></li>
            <li><span>2</span><p>Subscribe to the <strong>messages</strong> webhook field.</p></li>
            <li><span>3</span><p>Send a test message to confirm replies arrive.</p></li>
          </ol>
        </div>
      </div>
    </section>
  );
}
