#!/usr/bin/env python3
"""
Exotic · Email template builder + pusher
─────────────────────────────────────────
Builds all 13 Supabase Auth email templates in the game's monochrome
design (pure #000000 / #ffffff, 4-bar logo motif, no borders/gradients)
and pushes them + Resend SMTP settings to the live project.

Usage:  python3 build_and_push.py <SUPABASE_ACCESS_TOKEN> [PROJECT_REF]
"""
import json, os, sys, urllib.request

TOKEN = sys.argv[1] if len(sys.argv) > 1 else ""
REF = sys.argv[2] if len(sys.argv) > 2 else "teqnhdhearzrywiqssom"
FROM_EMAIL = "Exotic@DevilExotic.com"
SENDER_NAME = "Exotic"
SITE = "https://devilexotic.com"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))

FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"

# ── shared Exotic email shell (pure black/white, 4-bar logo motif) ─
SHELL = (
'<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8">'
'<meta name="viewport" content="width=device-width,initial-scale=1">'
'<title>@@SUBJECT@@</title></head>\n'
'<body style="margin:0;padding:0;background:#000000;">\n'
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">\n'
'<tr><td align="center" style="padding:44px 16px 52px;">\n'
'<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;">\n'
'\n'
'  <!-- logo: four descending bars -->\n'
'  <tr><td align="center" style="padding-bottom:2px;">\n'
'    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr style="vertical-align:bottom;">\n'
'      <td width="15" height="30" bgcolor="#ffffff" style="background-color:#ffffff;border-radius:5px;"></td>\n'
'      <td width="7"></td>\n'
'      <td width="15" height="38" bgcolor="#c9c9c9" style="background-color:#c9c9c9;border-radius:5px;"></td>\n'
'      <td width="7"></td>\n'
'      <td width="15" height="33" bgcolor="#8a8a8a" style="background-color:#8a8a8a;border-radius:5px;"></td>\n'
'      <td width="7"></td>\n'
'      <td width="15" height="27" bgcolor="#4d4d4d" style="background-color:#4d4d4d;border-radius:5px;"></td>\n'
'    </tr></table>\n'
'  </td></tr>\n'
'  <tr><td align="center" style="' + FONT + 'font-size:26px;line-height:1;font-weight:900;letter-spacing:-0.5px;color:#ffffff;padding:12px 0 5px;">Exotic</td></tr>\n'
'  <tr><td align="center" style="' + FONT + 'font-size:10px;line-height:1.4;font-weight:700;letter-spacing:3px;color:#9d9da9;padding-bottom:30px;">CRACK THE FOUR-DIGIT CODE</td></tr>\n'
'\n'
'  <!-- card -->\n'
'  <tr><td style="background-color:#0e0e11;border-radius:20px;padding:36px 32px;">\n'
'    <h1 style="margin:0 0 14px;' + FONT + 'font-size:24px;line-height:1.15;font-weight:900;letter-spacing:-0.4px;color:#ffffff;">@@HEADLINE@@</h1>\n'
'    <p style="margin:0 0 26px;' + FONT + 'font-size:15px;line-height:1.65;font-weight:500;color:#cfcfd6;">@@BODY@@</p>\n'
'@@ACTION@@\n'
'    <p style="margin:24px 0 0;' + FONT + 'font-size:12px;line-height:1.6;font-weight:600;color:#9d9da9;">@@FOOTNOTE@@</p>\n'
'  </td></tr>\n'
'\n'
'  <!-- footer -->\n'
'  <tr><td align="center" style="' + FONT + 'font-size:11px;line-height:1.7;font-weight:600;color:#63636e;padding-top:26px;">\n'
'    Exotic &nbsp;&middot;&nbsp; <a href="' + SITE + '" style="color:#63636e;text-decoration:none;">DevilExotic.com</a><br>\n'
'    @@SECURITY@@\n'
'  </td></tr>\n'
'</table>\n</td></tr></table>\n</body></html>'
)

def button(url, label):
    return (
'    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px 0 4px;"><tr>\n'
'      <td align="center" bgcolor="#ffffff" style="border-radius:12px;">\n'
'        <a href="' + url + '" style="display:inline-block;background-color:#ffffff;color:#000000;' + FONT + 'font-size:15px;line-height:1;font-weight:800;letter-spacing:.2px;padding:17px 42px;border-radius:12px;text-decoration:none;">' + label + '</a>\n'
'      </td>\n'
'    </tr></table>\n'
'    <p style="margin:18px 0 0;' + FONT + 'font-size:11px;line-height:1.6;font-weight:600;color:#63636e;word-break:break-all;">If the button doesn&#8217;t work, paste this link into your browser:<br><a href="' + url + '" style="color:#63636e;text-decoration:underline;">' + url + '</a></p>'
    )

def code_block():
    return (
'    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;"><tr>\n'
'      <td align="center" bgcolor="#1a1a20" style="background-color:#1a1a20;border-radius:14px;padding:24px 16px;">\n'
'        <span style="font-family:&#39;SF Mono&#39;,ui-monospace,Consolas,Menlo,monospace;font-size:32px;line-height:1;font-weight:800;letter-spacing:9px;color:#ffffff;">{{ .Token }}</span>\n'
'      </td>\n'
'    </tr></table>'
    )

def chip(value_html):
    return (
'    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 10px;"><tr>\n'
'      <td bgcolor="#1a1a20" style="background-color:#1a1a20;border-radius:12px;padding:13px 18px;' + FONT + 'font-size:14px;line-height:1.4;font-weight:700;color:#ffffff;word-break:break-all;">' + value_html + '</td>\n'
'    </tr></table>'
    )

IGNORE = "If you didn&#8217;t request this, you can safely ignore this email."

def shell(subject, headline, body, action, footnote="", security=IGNORE):
    html = (SHELL.replace("@@SUBJECT@@", subject).replace("@@HEADLINE@@", headline)
            .replace("@@BODY@@", body).replace("@@ACTION@@", action)
            .replace("@@FOOTNOTE@@", footnote).replace("@@SECURITY@@", security))
    return html

W = '<strong style="color:#ffffff;">'

# ── all 13 templates ───────────────────────────────────────────────
T = {}

T["confirmation"] = dict(
  subject="Confirm your email to enter the Duel Arena — Exotic",
  html=shell("Confirm your email — Exotic", "VERIFY YOUR SIGNAL",
    "One step left before the duels begin. Confirm this email address to activate your Exotic account and lock in your codename.",
    button("{{ .ConfirmationURL }}", "Confirm email"),
    "This link expires after 24 hours."))

T["email_change"] = dict(
  subject="Confirm your new email — Exotic",
  html=shell("Confirm your new email — Exotic", "NEW SIGNAL DETECTED",
    "You&#8217;re switching the email on your Exotic duel account. Confirm to keep dueling from the new address:"
    + chip("{{ .NewEmail }}") + "Previous address: " + W + "{{ .OldEmail }}</strong>",
    button("{{ .ConfirmationURL }}", "Confirm new email"),
    "Your old email stays active until the new one is confirmed."))

T["invite"] = dict(
  subject="You've been invited to Exotic — crack the code",
  html=shell("You're invited — Exotic", "THE VAULT AWAITS",
    "You&#8217;ve been invited to Exotic — the 4-digit code-breaking arena. Answer riddles, math and science questions to earn clues, then crack the code before your rival does.",
    button("{{ .ConfirmationURL }}", "Accept invite"),
    "Duel Arena · Solo Vault · Live real-time duels"))

T["magic_link"] = dict(
  subject="Your Exotic sign-in link",
  html=shell("Your sign-in link — Exotic", "ONE-TAP ACCESS",
    "Tap below to sign in to your Exotic duel account. No password needed — the code does the talking.",
    button("{{ .ConfirmationURL }}", "Sign in to Exotic"),
    "This link can only be used once and expires shortly."))

T["reauthentication"] = dict(
  subject="{{ .Token }} · your Exotic verification code",
  html=shell("Your verification code — Exotic", "VERIFY IT&#8217;S YOU",
    "Enter this code in Exotic to confirm it&#8217;s really you:",
    code_block(),
    "This code expires shortly and can only be used once.",
    "If you didn&#8217;t request this code, secure your account immediately."))

T["recovery"] = dict(
  subject="Reset your Exotic password",
  html=shell("Reset your password — Exotic", "CODEBREAKER LOCKED OUT?",
    "We got a request to reset the password on your Exotic duel account" + W + " {{ .Email }}</strong>. Set a new one below:",
    button("{{ .ConfirmationURL }}", "Reset password"),
    "This link expires after 24 hours and can only be used once."))

T["password_changed_notification"] = dict(
  subject="Your Exotic password was changed",
  html=shell("Password changed — Exotic", "PASSWORD UPDATED",
    "The password on your Exotic duel account was just changed.",
    chip("If this wasn&#8217;t you — reset your password immediately at DevilExotic.com"),
    "No action is needed if you made this change.",
    "Security notice · Exotic Duel Arena"))

T["email_changed_notification"] = dict(
  subject="Your Exotic email was changed",
  html=shell("Email changed — Exotic", "EMAIL UPDATED",
    "The email on your Exotic duel account was changed from " + W + "{{ .OldEmail }}</strong> to " + W + "{{ .Email }}</strong>.",
    chip("If this wasn&#8217;t you — contact support immediately."),
    "You&#8217;re receiving this notice at your old address.",
    "Security notice · Exotic Duel Arena"))

T["phone_changed_notification"] = dict(
  subject="Your Exotic phone number was changed",
  html=shell("Phone changed — Exotic", "PHONE UPDATED",
    "The phone number on your Exotic account was changed from " + W + "{{ .OldPhone }}</strong> to " + W + "{{ .Phone }}</strong>.",
    chip("If this wasn&#8217;t you — secure your account immediately."),
    "",
    "Security notice · Exotic Duel Arena"))

T["mfa_factor_enrolled_notification"] = dict(
  subject="A new verification method was added to Exotic",
  html=shell("New verification method — Exotic", "NEW FACTOR ENROLLED",
    "A new multi-factor method was added to your Exotic account:",
    chip("{{ .FactorType }}"),
    "If this wasn&#8217;t you, remove it in Settings right away.",
    "Security notice · Exotic Duel Arena"))

T["mfa_factor_unenrolled_notification"] = dict(
  subject="A verification method was removed from Exotic",
  html=shell("Verification method removed — Exotic", "FACTOR REMOVED",
    "A multi-factor method was removed from your Exotic account:",
    chip("{{ .FactorType }}"),
    "Your account is easier to breach without it — consider re-enrolling.",
    "Security notice · Exotic Duel Arena"))

T["identity_linked_notification"] = dict(
  subject="A new sign-in method was linked to Exotic",
  html=shell("Sign-in method linked — Exotic", "NEW LINK ESTABLISHED",
    "A new sign-in method was linked to your Exotic duel account:",
    chip("{{ .Provider }}"),
    "You can now sign in with this provider.",
    "Security notice · Exotic Duel Arena"))

T["identity_unlinked_notification"] = dict(
  subject="A sign-in method was removed from Exotic",
  html=shell("Sign-in method removed — Exotic", "LINK SEVERED",
    "A sign-in method was removed from your Exotic duel account:",
    chip("{{ .Provider }}"),
    "You can no longer sign in with this provider.",
    "Security notice · Exotic Duel Arena"))

SUBJ_KEY = {
  "confirmation": "mailer_subjects_confirmation",
  "email_change": "mailer_subjects_email_change",
  "invite": "mailer_subjects_invite",
  "magic_link": "mailer_subjects_magic_link",
  "reauthentication": "mailer_subjects_reauthentication",
  "recovery": "mailer_subjects_recovery",
  "password_changed_notification": "mailer_subjects_password_changed_notification",
  "email_changed_notification": "mailer_subjects_email_changed_notification",
  "phone_changed_notification": "mailer_subjects_phone_changed_notification",
  "mfa_factor_enrolled_notification": "mailer_subjects_mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification": "mailer_subjects_mfa_factor_unenrolled_notification",
  "identity_linked_notification": "mailer_subjects_identity_linked_notification",
  "identity_unlinked_notification": "mailer_subjects_identity_unlinked_notification",
}
TPL_KEY = {k: "mailer_templates_" + k + "_content" for k in SUBJ_KEY}

def main():
    # 1 · write files
    for name, t in T.items():
        with open(os.path.join(OUT_DIR, name + ".html"), "w") as f:
            f.write(t["html"])
    print("wrote", len(T), "templates to", OUT_DIR)

    if not TOKEN:
        print("no token given — files only"); return

    # 2 · push config
    patch = {
      "smtp_host": "smtp.resend.com",
      "smtp_port": "465",
      "smtp_user": "resend",
      "smtp_pass": os.environ.get("RESEND_API_KEY", ""),
      "smtp_admin_email": FROM_EMAIL,
      "smtp_sender_name": SENDER_NAME,
      "smtp_max_frequency": 15,
      "site_url": SITE,
      "uri_allow_list": SITE + "," + SITE.replace("://", "://www."),
      "mailer_notifications_password_changed_enabled": True,
      "mailer_notifications_email_changed_enabled": True,
      "mailer_notifications_phone_changed_enabled": True,
      "mailer_notifications_mfa_factor_enrolled_enabled": True,
      "mailer_notifications_mfa_factor_unenrolled_enabled": True,
      "mailer_notifications_identity_linked_enabled": True,
      "mailer_notifications_identity_unlinked_enabled": True,
    }
    for name, t in T.items():
        patch[SUBJ_KEY[name]] = t["subject"]
        patch[TPL_KEY[name]] = t["html"]

    import time, subprocess
    def call(payload):
        # NOTE: python-urllib is blocked by Cloudflare (error 1010) — shell
        # out to curl instead, which passes for identical payloads.
        p = subprocess.run([
            "curl", "-s", "-m", "90", "-X", "PATCH",
            f"https://api.supabase.com/v1/projects/{REF}/config/auth",
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "content-type: application/json",
            "-d", json.dumps(payload),
        ], capture_output=True, text=True)
        if p.returncode != 0 or not p.stdout.strip().startswith("{"):
            print("push failed:", p.stdout[:300], p.stderr[:300])
            raise RuntimeError("config/auth push failed")
        return json.loads(p.stdout)

    # phase 1 · complete SMTP set (templates are gated until SMTP exists)
    smtp = {k: patch[k] for k in ["smtp_host","smtp_port","smtp_user","smtp_pass",
           "smtp_admin_email","smtp_sender_name","smtp_max_frequency"]}
    call(smtp); time.sleep(3)
    # phase 2 · site, redirects, notifications (no templates — keeps payload small)
    tpl_keys = {SUBJ_KEY[n] for n in T} | {TPL_KEY[n] for n in T}
    rest = {k: v for k, v in patch.items() if k not in smtp and k not in tpl_keys}
    call(rest); time.sleep(2)
    # phase 3 · templates in small batches (one giant PATCH gets 403'd)
    names = list(T.keys())
    res = {}
    for i in range(0, len(names), 2):
        batch = {SUBJ_KEY[n]: T[n]["subject"] for n in names[i:i+2]}
        batch.update({TPL_KEY[n]: T[n]["html"] for n in names[i:i+2]})
        res.update(call(batch)); time.sleep(2)
        print("  pushed:", ", ".join(names[i:i+2]))

    checks = {
      "smtp_host": res.get("smtp_host"),
      "smtp_admin_email (From)": res.get("smtp_admin_email"),
      "smtp_sender_name": res.get("smtp_sender_name"),
      "site_url": res.get("site_url"),
      "uri_allow_list": res.get("uri_allow_list"),
      "smtp_pass set": bool(res.get("smtp_pass")),
      "custom templates flagged": sum(1 for k, v in (res.get("mailer_templates_custom_contents") or {}).items() if v),
      "custom subjects flagged": sum(1 for k, v in (res.get("mailer_subjects_custom_contents") or {}).items() if v),
      "notifications on": sum(1 for k in ["mailer_notifications_password_changed_enabled","mailer_notifications_email_changed_enabled","mailer_notifications_phone_changed_enabled","mailer_notifications_mfa_factor_enrolled_enabled","mailer_notifications_mfa_factor_unenrolled_enabled","mailer_notifications_identity_linked_enabled","mailer_notifications_identity_unlinked_enabled"] if res.get(k)),
    }
    for k, v in checks.items():
        print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
