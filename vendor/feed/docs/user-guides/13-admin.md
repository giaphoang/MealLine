# Admin

The Admin page is where you decide who can use FEED. It appears under
Information in the sidebar, and only administrators can see it.

Changing someone's role never changes what they can see. Everyone who signs in
sees the same shared inventory, translations, templates, and reports. Roles
decide who can manage access, not who sees what.

![Admin page on the Sign-in tab with the staff roster kept out of frame](/help-screenshots/admin-overview.png)

## Staff and Administrators

**Staff** can do all the everyday work: inventory, translations, shopping
lists, documents, and reports.

**Administrators** can do all of that, plus manage who has access, choose how
sign-in works, and review the activity history.

FEED always keeps at least one administrator. If you try to make a change that
would leave nobody in charge, FEED explains why it cannot.

## Inviting someone new

1. Open **Tools & Settings → Admin**.
2. On the **Staff** tab, select **Invite**.
3. Enter their work email address and send the invitation.

They receive an email with a link to the sign-in page. The email does not
contain a sign-in code — they request one themselves, the same way everyone
else signs in.

New people always start as Staff. If they need to manage access too, make them
an administrator afterwards.

Until they sign in for the first time, their row shows **Not yet signed in**.

## Removing access when someone leaves

Use **Revoke access**. They are signed out the next time they do anything, and
they cannot sign in again until you restore it.

**Revoke access** is the durable choice. **Remove from roster** deletes the row
and its sign-in history, but if their mailbox still works, signing in would
create a new Staff account. Revoke first; remove only rows created by mistake.

The **Last sign-in** column tells you who is still using FEED, which is usually
the fastest way to decide who no longer needs access.

## Choosing how strict sign-in is

The **Sign-in** tab offers two modes.

**Domain** is the standard setting. Anyone with a William Temple House email
address can sign in, and gets a Staff account the first time they do.

**Allowlist** is stricter. Only the people on your Staff list can sign in, even
if they have a valid work address. Choose this if you want a colleague whose
email account is compromised to be unable to reach FEED.

Before switching to Allowlist, check the Staff list is right — anyone missing
from it will be turned away. Invite new staff before their first sign-in rather
than after.

Allowlist mode needs **two** administrators who can sign in, not one. That way
a changed or lost mailbox cannot lock everyone out. FEED will not let you switch
until a second administrator is in place.

Revoked accounts are blocked in either mode.

## The message people see

You can write what someone sees when they are turned away, and set the contact
address shown with it. The Sign-in tab previews exactly what will appear.

Keep it useful — the most likely reader is a colleague who does not yet have
access and wants to know who to ask.

## History

The **History** tab records every change an administrator makes: who did it,
what changed, who it affected, and when.

Two entries are not people:

- **FEED upgrade** — changes made by an update, such as the one that first set
  up roles.
- **Server console** — changes made directly on the pantry server, which is how
  access is restored if everyone is ever locked out.

## If everyone is locked out

Access can be restored from the pantry server itself. Contact whoever maintains
FEED for your organization; they have a documented recovery step that does not
depend on being able to sign in.
