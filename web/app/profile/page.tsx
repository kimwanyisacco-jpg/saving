"use client";
import { useEffect, useState } from "react";
import { KeyRound, Save, ShieldCheck, UserCog } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Card, Field, Notice, Spinner, useToast } from "@/components/ui";
import { api, getSession, setSession } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Profile {
  id: string; name: string; email: string | null; phone: string | null;
  role: "admin" | "staff"; last_login_at: string | null; created_at: string;
  password_changed_at: string | null;
}

export default function ProfilePage() {
  return <Authed title="Profile">{(me) => <Profile />}</Authed>;
}

function Profile() {
  const { toast, toastView } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ user: Profile }>("/auth/profile")
      .then((r) => { if (alive) setProfile(r.user); })
      .catch((e) => { if (alive) setLoadError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <Spinner label="Loading your profile" />;
  if (loadError) return <Notice tone="error">{loadError}</Notice>;

  return (
    <div className="space-y-5">
      {toastView}
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink">My profile</h1>
        <p className="text-sm text-ink-mute">
          {profile?.role === "admin" ? "Administrator" : "Staff"} account
          {profile?.last_login_at ? ` · last signed in ${formatDate(String(profile.last_login_at).slice(0, 10))}` : ""}
        </p>
      </div>

      <Details
        profile={profile!}
        onSaved={(u) => { setProfile(u); toast({ tone: "success", text: "Your details were saved." }); }}
      />

      <Password onChanged={() => {
        setProfile((p) => (p ? { ...p, password_changed_at: new Date().toISOString() } : p));
        toast({ tone: "success", text: "Password changed. Other devices have been signed out." });
      }} />

      <Card title="About your sign-in">
        <ul className="space-y-2 text-sm text-ink-soft">
          <li>Your email is the name you sign in with, so changing it asks for your current password.</li>
          <li>Changing your password signs you out everywhere else. This device stays signed in.</li>
          <li>
            {profile?.password_changed_at
              ? `Password last changed on ${formatDate(String(profile.password_changed_at).slice(0, 10))}.`
              : "Your password has not been changed since the account was created."}
          </li>
          <li>If you forget your password, an administrator can set a new one from Admin.</li>
        </ul>
      </Card>
    </div>
  );
}

function Details({ profile, onSaved }: { profile: Profile; onSaved: (u: Profile) => void }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailChanged = email.trim().toLowerCase() !== (profile.email ?? "").toLowerCase();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, phone, email };
      if (emailChanged) body.current_password = currentPassword;
      const r = await api<{ user: Profile }>("/auth/profile", { method: "PATCH", body });
      const s = getSession();
      if (s) setSession({ ...s, user: { ...s.user, name: r.user.name, email: r.user.email, phone: r.user.phone } });
      setCurrentPassword("");
      onSaved(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><UserCog className="h-4 w-4" /> Your details</span>}>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Phone">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256..." />
        </Field>
        <Field label="Email (used to sign in)" hint="Changing this asks for your current password.">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {emailChanged && (
          <Field label="Current password" hint="Needed because the email is your sign-in name.">
            <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
        )}
        <div className="sm:col-span-2">
          <button className="btn-primary" disabled={busy}>
            <Save className="h-4 w-4" /> {busy ? "Saving..." : "Save details"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Password({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError("The two new passwords do not match."); return; }
    setBusy(true);
    try {
      const r = await api<{ token: string; message: string }>("/auth/password", {
        method: "POST", body: { current_password: current, new_password: next },
      });
      // The change invalidates the old token, so keep the freshly issued one.
      const s = getSession();
      if (s && r.token) setSession({ ...s, token: r.token });
      setCurrent(""); setNext(""); setConfirm("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change password</span>}>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password">
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Repeat new password">
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <button className="btn-primary" disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> {busy ? "Changing..." : "Change password"}
          </button>
          <span className="text-xs text-ink-mute">Other devices will need to sign in again.</span>
        </div>
      </form>
    </Card>
  );
}
