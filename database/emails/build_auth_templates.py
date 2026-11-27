"""
Modèles des e-mails de compte (Supabase Auth) : français, aux couleurs d'Amachia, logo en en-tête.
Génère email-templates-fr.json (appliqué à Supabase par l'API de gestion).
Usage : python3 build_auth_templates.py
"""
import json, os

LOGO = "https://amachia.com/email-logo-amachia.png"
DARK = "#18212a"
ORANGE = "#FF6800"


def layout(preheader: str, title: str, body: str, button: tuple[str, str] | None = None, after: str = "") -> str:
    btn = ""
    if button:
        label, url = button
        btn = f"""<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="border-radius:999px;background:{ORANGE}">
<a href="{url}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#000000;text-decoration:none;border-radius:999px">{label}</a>
</td></tr></table>"""
    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:{DARK};padding:22px 28px"><img src="{LOGO}" width="150" alt="Amachia" style="display:block;border:0;width:150px;height:auto"></td></tr>
<tr><td style="padding:30px 28px 10px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.6">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#111827">{title}</h1>
{body}{btn}{after}
</td></tr>
<tr><td style="padding:18px 28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;border-top:1px solid #eef0f2">
Amachia — achat en ligne au Cameroun · <a href="https://amachia.com" style="color:#6b7280">amachia.com</a><br>
Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.
</td></tr>
</table></td></tr></table></body></html>"""


def p(text: str) -> str:
    return f'<p style="margin:0 0 12px">{text}</p>'


def small(text: str) -> str:
    return f'<p style="margin:18px 0 0;font-size:13px;color:#6b7280">{text}</p>'


def link_fallback(url: str) -> str:
    return small(f'Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="{url}" style="color:#2563eb;word-break:break-all">{url}</a>')


URL = "{{ .ConfirmationURL }}"

# ---------- Confirmation d'inscription : invitation admin / vendeur / client ----------
admin_invite = layout(
    "Rejoignez l'équipe d'administration d'Amachia.",
    "Invitation à l'espace administrateur",
    p("Bonjour {{ .Data.amashia_invite_name }},")
    + p("Vous êtes invité(e) à rejoindre l'équipe d'administration d'Amachia. Confirmez votre adresse e-mail pour vérifier vos informations, choisir votre mot de passe et activer la double authentification."),
    ("Accepter l'invitation", URL),
    small("Ce lien est personnel et expire dans 1 heure. Si vous n'attendiez pas cette invitation, ignorez simplement cet e-mail.") + link_fallback(URL),
)
seller_confirm = layout(
    "Votre code de vérification pour ouvrir votre boutique : {{ .Token }}",
    "Bienvenue sur Amachia Seller !",
    p("Bonjour {{ .Data.first_name }},")
    + p("Merci d'avoir créé votre compte vendeur. Pour confirmer votre adresse e-mail, saisissez ce code sur la page d'inscription :")
    + f'<p style="margin:18px 0;padding:16px 0;text-align:center;background:#fff4ec;border-radius:12px;font-size:34px;font-weight:800;letter-spacing:10px;color:#111827">{{{{ .Token }}}}</p>',
    None,
    small("Ce code expire dans 1 heure. Ne le communiquez à personne : Amachia ne vous le demandera jamais. Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail."),
)
client_confirm = layout(
    "Confirmez votre adresse e-mail pour activer votre compte.",
    "Bienvenue sur Amachia !",
    p("Bonjour{{ if .Data.full_name }} {{ .Data.full_name }}{{ end }},")
    + p("Merci d'avoir créé votre compte. Confirmez votre adresse e-mail pour profiter de vos avantages : suivi de vos commandes, liste de souhaits et points récompense."),
    ("Confirmer mon adresse e-mail", URL),
    small("Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.") + link_fallback(URL),
)
confirmation = "{{ if .Data.amashia_invite }}" + admin_invite + "{{ else if .Data.account_type }}" + seller_confirm + "{{ else }}" + client_confirm + "{{ end }}"

recovery = layout(
    "Choisissez un nouveau mot de passe pour votre compte Amachia.",
    "Réinitialisation de votre mot de passe",
    p("Bonjour,")
    + p("Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Amachia ({{ .Email }}). Cliquez sur le bouton ci-dessous pour en choisir un nouveau."),
    ("Choisir un nouveau mot de passe", URL),
    small("Ce lien expire dans 1 heure et ne peut servir qu'une fois. Si vous n'avez rien demandé, ignorez cet e-mail : votre mot de passe reste inchangé.") + link_fallback(URL),
)

magic_generic = layout(
    "Votre lien de connexion à Amachia.",
    "Votre lien de connexion",
    p("Bonjour,") + p("Cliquez sur le bouton ci-dessous pour vous connecter à votre compte Amachia."),
    ("Me connecter", URL),
    small("Ce lien expire rapidement et ne peut servir qu'une fois. Si vous n'avez rien demandé, ignorez cet e-mail.") + link_fallback(URL),
)
magic_link = "{{ if .Data.amashia_invite }}" + admin_invite + "{{ else }}" + magic_generic + "{{ end }}"

email_change = layout(
    "Confirmez votre nouvelle adresse e-mail.",
    "Confirmez votre nouvelle adresse e-mail",
    p("Bonjour,") + p("Vous avez demandé à remplacer l'adresse e-mail de votre compte Amachia par <strong>{{ .NewEmail }}</strong>. Confirmez ce changement en cliquant sur le bouton ci-dessous."),
    ("Confirmer le changement", URL),
    small("Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail et changez votre mot de passe par précaution.") + link_fallback(URL),
)

invite = layout(
    "Vous êtes invité(e) à créer votre compte Amachia.",
    "Vous êtes invité(e) sur Amachia",
    p("Bonjour,") + p("Vous avez été invité(e) à créer un compte sur Amachia. Cliquez sur le bouton ci-dessous pour accepter l'invitation."),
    ("Accepter l'invitation", URL),
    small("Si vous n'attendiez pas cette invitation, ignorez simplement cet e-mail.") + link_fallback(URL),
)

reauthentication = layout(
    "Votre code de vérification Amachia.",
    "Votre code de vérification",
    p("Bonjour,") + p("Utilisez ce code pour confirmer votre identité :")
    + f'<p style="margin:18px 0;font-size:30px;font-weight:800;letter-spacing:6px;color:#111827">{{{{ .Token }}}}</p>',
    None,
    small("Ce code expire rapidement. Ne le communiquez à personne : Amachia ne vous le demandera jamais."),
)

password_changed = layout(
    "Le mot de passe de votre compte a été modifié.",
    "Votre mot de passe a été modifié",
    p("Bonjour,") + p("Le mot de passe de votre compte Amachia ({{ .Email }}) vient d'être modifié."),
    None,
    small("Si c'est bien vous, aucune action n'est nécessaire. Sinon, réinitialisez immédiatement votre mot de passe depuis la page de connexion et contactez-nous."),
)

email_changed = layout(
    "L'adresse e-mail de votre compte a été modifiée.",
    "Votre adresse e-mail a été modifiée",
    p("Bonjour,") + p("L'adresse e-mail de votre compte Amachia a été remplacée par <strong>{{ .Email }}</strong> (ancienne adresse : {{ .OldEmail }})."),
    None,
    small("Si vous n'êtes pas à l'origine de ce changement, contactez-nous au plus vite."),
)

templates = {
    "mailer_subjects_confirmation": "{{ if .Data.amashia_invite }}Invitation à l'espace administrateur Amachia{{ else if .Data.account_type }}{{ .Token }} est votre code Amachia Seller{{ else }}Confirmez votre adresse e-mail — Amachia{{ end }}",
    "mailer_templates_confirmation_content": confirmation,
    "mailer_subjects_recovery": "Réinitialisez votre mot de passe — Amachia",
    "mailer_templates_recovery_content": recovery,
    "mailer_subjects_magic_link": "{{ if .Data.amashia_invite }}Invitation à l'espace administrateur Amachia{{ else }}Votre lien de connexion — Amachia{{ end }}",
    "mailer_templates_magic_link_content": magic_link,
    "mailer_subjects_email_change": "Confirmez votre nouvelle adresse e-mail — Amachia",
    "mailer_templates_email_change_content": email_change,
    "mailer_subjects_invite": "Vous êtes invité(e) sur Amachia",
    "mailer_templates_invite_content": invite,
    "mailer_subjects_reauthentication": "Votre code de vérification Amachia : {{ .Token }}",
    "mailer_templates_reauthentication_content": reauthentication,
    "mailer_subjects_password_changed_notification": "Votre mot de passe Amachia a été modifié",
    "mailer_templates_password_changed_notification_content": password_changed,
    "mailer_subjects_email_changed_notification": "Votre adresse e-mail Amachia a été modifiée",
    "mailer_templates_email_changed_notification_content": email_changed,
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "email-templates-fr.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(templates, f, ensure_ascii=False, indent=2)
# aperçus (pour vérification visuelle)
prev = os.path.join(os.path.dirname(os.path.abspath(__file__)), "previews")
os.makedirs(prev, exist_ok=True)
for name, html in {"confirmation-client": client_confirm, "confirmation-vendeur": seller_confirm, "invitation-admin": admin_invite, "mot-de-passe": recovery, "code": reauthentication}.items():
    with open(os.path.join(prev, name + ".html"), "w", encoding="utf-8") as f:
        f.write(html.replace("{{ .Data.first_name }}", "Jean").replace("{{ .Data.amashia_invite_name }}", "Marie").replace("{{ if .Data.full_name }} {{ .Data.full_name }}{{ end }}", " Aïcha").replace("{{ .Email }}", "client@exemple.cm").replace("{{ .Token }}", "482915").replace(URL, "https://amachia.com/…"))
print("ok", out)
