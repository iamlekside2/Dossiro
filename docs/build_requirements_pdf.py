"""
Builds docs/Dossiro-Requirements.pdf from the same content as requirements.html.

    python docs/build_prd_pdf.py

A script rather than a hand export, so the PDF can be regenerated when the
requirements change instead of drifting away from the page they came from.
Follows the product's own design system: square corners, rules not shadows.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

OUT = Path(__file__).resolve().parent / "Dossiro-Requirements.pdf"

INK = colors.HexColor("#141A22")
INK_SOFT = colors.HexColor("#5B6674")
INK_FAINT = colors.HexColor("#8792A1")
ACCENT = colors.HexColor("#25508C")
RULE = colors.HexColor("#D8DEE7")
RULE_FIRM = colors.HexColor("#B9C3D1")
PANEL = colors.HexColor("#F4F6F9")

PRI = {
    "P0": (colors.HexColor("#8F2230"), colors.HexColor("#FBE9EB")),
    "P1": (colors.HexColor("#8A5C07"), colors.HexColor("#F9EFD9")),
    "P2": (colors.HexColor("#3D5A80"), colors.HexColor("#E8EEF6")),
    "Later": (colors.HexColor("#626C7A"), colors.HexColor("#ECEDF0")),
}


def register_fonts():
    win = Path("C:/Windows/Fonts")
    try:
        pdfmetrics.registerFont(TTFont("Segoe", win / "segoeui.ttf"))
        pdfmetrics.registerFont(TTFont("Segoe-Bold", win / "segoeuib.ttf"))
        pdfmetrics.registerFont(TTFont("Segoe-Semi", win / "seguisb.ttf"))
        body, bold, semi = "Segoe", "Segoe-Bold", "Segoe-Semi"
    except Exception:
        body, bold, semi = "Helvetica", "Helvetica-Bold", "Helvetica-Bold"
    try:
        pdfmetrics.registerFont(TTFont("Cons", win / "consola.ttf"))
        pdfmetrics.registerFont(TTFont("Cons-Bold", win / "consolab.ttf"))
        mono, monob = "Cons", "Cons-Bold"
    except Exception:
        mono, monob = "Courier", "Courier-Bold"
    return body, bold, semi, mono, monob


BODY_F, BOLD_F, SEMI_F, MONO_F, MONOB_F = register_fonts()

S = {
    "title": ParagraphStyle("title", fontName=BOLD_F, fontSize=44, leading=46, textColor=INK, spaceAfter=14),
    "standfirst": ParagraphStyle("standfirst", fontName=BODY_F, fontSize=12.5, leading=18.5, textColor=INK_SOFT),
    "kicker": ParagraphStyle("kicker", fontName=MONO_F, fontSize=8, leading=12, textColor=INK_FAINT, spaceAfter=10),
    "eyebrow": ParagraphStyle("eyebrow", fontName=MONO_F, fontSize=7.5, leading=11, textColor=ACCENT, spaceAfter=3),
    "h2": ParagraphStyle("h2", fontName=BOLD_F, fontSize=19, leading=23, textColor=INK, spaceAfter=7),
    "h3": ParagraphStyle("h3", fontName=BOLD_F, fontSize=12, leading=16, textColor=INK, spaceBefore=12, spaceAfter=4),
    "body": ParagraphStyle("body", fontName=BODY_F, fontSize=9.7, leading=15, textColor=INK, spaceAfter=8),
    "lede": ParagraphStyle("lede", fontName=BODY_F, fontSize=11, leading=17, textColor=INK_SOFT, spaceAfter=10),
    "bullet": ParagraphStyle("bullet", fontName=BODY_F, fontSize=9.7, leading=14.5, textColor=INK,
                             leftIndent=13, bulletIndent=2, spaceAfter=5),
    "id": ParagraphStyle("id", fontName=MONOB_F, fontSize=8, leading=12, textColor=INK_SOFT),
    "req": ParagraphStyle("req", fontName=SEMI_F, fontSize=9, leading=12.6, textColor=INK, spaceAfter=2),
    "crit": ParagraphStyle("crit", fontName=BODY_F, fontSize=8.2, leading=11.8, textColor=INK_SOFT),
    "cell": ParagraphStyle("cell", fontName=BODY_F, fontSize=8.6, leading=12.6, textColor=INK),
    "cellsoft": ParagraphStyle("cellsoft", fontName=BODY_F, fontSize=8.6, leading=12.6, textColor=INK_SOFT),
    "th": ParagraphStyle("th", fontName=MONO_F, fontSize=7, leading=10, textColor=INK_FAINT),
    "panel": ParagraphStyle("panel", fontName=BODY_F, fontSize=9.4, leading=14.5, textColor=INK),
    "panelTitle": ParagraphStyle("panelTitle", fontName=MONO_F, fontSize=7, leading=11,
                                 textColor=INK_FAINT, spaceAfter=4),
    "note": ParagraphStyle("note", fontName=BODY_F, fontSize=8.6, leading=13, textColor=INK_SOFT),
    "factLabel": ParagraphStyle("factLabel", fontName=MONO_F, fontSize=6.8, leading=10, textColor=INK_FAINT),
    "factValue": ParagraphStyle("factValue", fontName=SEMI_F, fontSize=9.6, leading=13, textColor=INK),
}


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(t, S["bullet"], bulletText="\u2013") for t in items]


def pri_cell(level):
    fg, bg = PRI[level]
    st = ParagraphStyle(f"pri{level}", fontName=MONOB_F, fontSize=7, leading=9.5, textColor=fg)
    t = Table([[Paragraph(level.upper(), st)]], colWidths=[13 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.5, fg),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    return t


def reqs(rows):
    """One requirement per row: id, statement, acceptance condition, priority."""
    data = [[Paragraph("ID", S["th"]), Paragraph("REQUIREMENT", S["th"]), Paragraph("PRI", S["th"])]]
    for rid, statement, crit, level in rows:
        cell = [p(statement, "req"), p(f"<b>Accepted when</b> {crit}", "crit")]
        data.append([p(rid, "id"), cell, pri_cell(level)])

    t = Table(data, colWidths=[17 * mm, 132 * mm, 17 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PANEL),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE_FIRM),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def plain_table(headers, rows, widths):
    data = [[Paragraph(h.upper(), S["th"]) for h in headers]] + rows
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PANEL),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE_FIRM),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def panel(title, text):
    inner = [p(title, "panelTitle"), p(text, "panel")]
    t = Table([[inner]], colWidths=[166 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def section(eyebrow, heading):
    return [Spacer(1, 10), p(eyebrow, "eyebrow"), p(heading, "h2")]


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(INK); canvas.setLineWidth(1.6)
    canvas.line(22 * mm, 250 * mm, 188 * mm, 250 * mm)
    canvas.setFont(MONO_F, 7.5); canvas.setFillColor(INK_FAINT)
    canvas.drawString(22 * mm, 18 * mm, "CALM GLOBAL  ·  LAGOS AND ABUJA")
    canvas.drawRightString(188 * mm, 18 * mm, "COMMERCIAL IN CONFIDENCE")
    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFont(MONO_F, 7); canvas.setFillColor(INK_FAINT)
    canvas.drawString(22 * mm, 285 * mm, "DOSSIRO  ·  PRODUCT REQUIREMENTS")
    canvas.drawRightString(188 * mm, 285 * mm, "v1.0  ·  19 SEPTEMBER 2026")
    canvas.setStrokeColor(RULE); canvas.setLineWidth(0.5)
    canvas.line(22 * mm, 282 * mm, 188 * mm, 282 * mm)
    canvas.line(22 * mm, 20 * mm, 188 * mm, 20 * mm)
    canvas.setFillColor(INK_SOFT); canvas.setFont(MONO_F, 7.5)
    canvas.drawRightString(188 * mm, 14 * mm, str(canvas.getPageNumber()))
    canvas.restoreState()


# ---- the requirements ----------------------------------------------------

TEN = [
    ("TEN-1", "Each customer is an isolated tenancy", "no query, export or search can return another tenancy's data, and this is proven by automated test on every build", "P0"),
    ("TEN-2", "A tenancy answers on its own web address", "visiting it identifies the organisation before sign-in, and shows that organisation's name and branding", "P0"),
    ("TEN-3", "One person may belong to more than one tenancy", "a consultant signs in to each separately; nothing is shared between them, including sessions", "P0"),
    ("TEN-4", "Sign-in with Microsoft Entra and Okta", "an administrator connects the provider and passwords become unnecessary for staff", "P0"),
    ("TEN-5", "Sign-in against on-premises Active Directory or LDAP", "a self-hosted customer authenticates against their existing directory", "P1"),
    ("TEN-6", "Two-factor authentication, enforceable as policy", "an administrator can require it for a role or for everyone, and non-compliant accounts cannot sign in", "P0"),
    ("TEN-7", "A tenancy may restrict an account to one active session", "signing in elsewhere names the other device and requires an explicit takeover, which ends the first session immediately", "P1"),
    ("TEN-8", "An administrator can end any session immediately", "the revoked session's next request fails, without waiting for a token to expire", "P0"),
    ("TEN-9", "Devices are recognised and can be individually revoked", "revoking a device wipes any records cached on it for offline use", "P1"),
    ("TEN-10", "Staff are organised into departments that nest", "a grant to a parent department reaches its children without a second grant", "P0"),
    ("TEN-11", "Staff are also organised by branch or location", "a grant can be scoped to a branch and to the offices beneath it", "P1"),
    ("TEN-12", "Roles are definable by the customer, not fixed by us", "an administrator composes a role from individual permissions and assigns it", "P1"),
]

FIL = [
    ("FIL-1", "Cabinets, drawers and folders nesting without limit", "depth is not capped, and moving a folder carries its whole subtree", "P0"),
    ("FIL-2", "A drawer can be locked behind a passcode", "entry requires the passcode even for someone whose role otherwise permits it, and each entry is recorded", "P1"),
    ("FIL-3", "A folder can be sealed from inheritance", "grants from above do not reach into it; only explicit grants apply", "P0"),
    ("FIL-4", "Access is granted to a person, a department, or a role", "all three resolve, and a person's effective access is the combination", "P0"),
    ("FIL-5", "Access levels separate viewing from taking a copy", "a person may be permitted to read a contract on screen and refused the download of it", "P0"),
    ("FIL-6", "Levels cover view, modify, delete, print, send, check out, and the right to grant access", "each is independently assignable", "P0"),
    ("FIL-7", "The nearest rule wins, and a denial beats a permission at the same distance", "a person with department-wide access can be excluded from one folder inside it", "P0"),
    ("FIL-8", "Records a person cannot reach are invisible, not locked", "a folder listing shows no trace of what is withheld — not a greyed row, not a count", "P0"),
    ("FIL-9", "Classification constrains a record independently of permission", "the most sensitive class cannot be sent outside the organisation by any route, by anyone", "P0"),
    ("FIL-10", "A person can see why they can or cannot reach a record", "the interface names the rule and where it came from", "P2"),
    ("FIL-11", "Every edition is kept, and any prior edition can be restored", "restoring creates a new edition rather than overwriting history", "P0"),
    ("FIL-12", "A record can be checked out, blocking others from editing", "a second person is told who holds it and since when, and an administrator can force its release", "P1"),
]

TYP = [
    ("TYP-1", "A customer defines their own document types without a developer", "an administrator creates a type such as Contract or Personnel File in the browser, and there is no limit on how many exist", "P0"),
    ("TYP-2", "Each type carries typed index fields", "text, date, number, yes/no and selection-list fields are all available, and each can be marked required", "P0"),
    ("TYP-3", "Index fields are searchable as fields, not as text", "a query can ask for contracts expiring between two dates, or where contractor equals a named party", "P0"),
    ("TYP-4", "A selection-list field can draw its values from an external system", "a customer's existing supplier list populates the field without re-keying", "P2"),
    ("TYP-5", "Version keeping is configurable per type", "a type can be set to hold one edition only, where history is unwanted", "P1"),
    ("TYP-6", "A watermark can be set per type, not only per share", "every view of a record of that type is watermarked, however it was reached", "P1"),
    ("TYP-7", "A tenancy's configuration exports to a portable file and imports into another", "types, retention rules, notification rules and structure move between a test and a live tenancy", "P2"),
]

CAP = [
    ("CAP-1", "Documents are captured from a scanner in bulk", "a stack scans in one pass, is deskewed, and separates into records without one-by-one handling", "P0"),
    ("CAP-2", "Documents arrive by email to a monitored address", "the sender is verified against a known account or domain before the attachment is filed", "P1"),
    ("CAP-3", "Documents arrive by WhatsApp from verified senders", "a field officer photographs a delivery note and it lands in the right folder", "P1"),
    ("CAP-4", "Documents are captured from a phone camera with edge detection", "a photographed page is corrected to a readable, straightened image", "P1"),
    ("CAP-5", "Every document is made text-searchable on arrival", "a scanned page is searchable by its content within minutes of filing, without anyone requesting it", "P0"),
    ("CAP-6", "Index fields are filled automatically from the document", "a recurring form has its fields read from known positions; a new layout is learned from one example", "P1"),
    ("CAP-7", "A name, folder and classification are proposed for what arrives", "the proposal is shown for confirmation and nothing is renamed or moved unattended", "P1"),
    ("CAP-8", "Anything captured enters the same pipeline regardless of route", "a WhatsApp photo and a scanner page receive identical naming, indexing and classification treatment", "P0"),
    ("CAP-9", "Office documents convert to PDF in bulk", "a folder of mixed formats converts without opening each one", "P2"),
    ("CAP-10", "Extraction that is uncertain is queued for a person, never guessed", "a low-confidence field is flagged for review and excluded from reports until confirmed", "P0"),
]

SRC = [
    ("SRC-1", "Search covers document content, not only names and metadata", "a phrase inside a scanned contract is found", "P0"),
    ("SRC-2", "Results never include a record the searcher cannot open", "counts and result sets are scoped to permission, and reveal nothing by omission", "P0"),
    ("SRC-3", "Results show why they matched", "the matching phrase is quoted from the document with the matched words marked", "P0"),
    ("SRC-4", "Search filters on document type and that type's fields", "multiple field criteria combine in one query", "P0"),
    ("SRC-5", "Search filters on cabinet, creator, date ranges and classification", "created and modified ranges are independently selectable", "P0"),
    ("SRC-6", "Exact phrase, any word and all words are all supported", "each returns a demonstrably different result set", "P1"),
    ("SRC-7", "Search covers the current edition by default, with prior editions optional", "the choice is explicit in the interface", "P1"),
    ("SRC-8", "Search filters on workflow state", "everything awaiting a named person's approval is findable in one query", "P1"),
    ("SRC-9", "A search can be saved and re-run", "a saved search is available from the toolbar and can be shared with a department", "P2"),
    ("SRC-10", "Search by meaning, not only by words", "a query for \"termination clause\" finds a document phrasing it as \"notice of cancellation\"", "P2"),
    ("SRC-11", "Results return within two seconds at one million records", "measured at the 95th percentile on the reference deployment", "P0"),
]

VEW = [
    ("VEW-1", "Documents are viewed in the browser with nothing installed", "PDF, Office formats and images all render without a plug-in or a download", "P0"),
    ("VEW-2", "Viewing does not require the ability to download", "a view-only record is rendered without the original bytes ever reaching the browser", "P0"),
    ("VEW-3", "Pages can be annotated with notes, highlights and stamps", "annotations are separate from the document and can be hidden, and never alter the original", "P1"),
    ("VEW-4", "Content can be redacted irreversibly for onward sharing", "the redacted copy contains no recoverable trace of what was removed", "P1"),
    ("VEW-5", "Comments can be attached to a record and replied to", "a thread is visible to everyone with access and is part of the record's history", "P1"),
    ("VEW-6", "Two people can edit one document at the same time", "both see each other's changes live, and neither loses work", "P2"),
    ("VEW-7", "Editions can be compared", "what changed between two editions is shown without opening both", "P2"),
]

SHR = [
    ("SHR-1", "A record can be sent to someone with no account", "the recipient opens exactly that record and can reach nothing else", "P0"),
    ("SHR-2", "A share carries an expiry", "it stops working at the stated time without anyone intervening", "P0"),
    ("SHR-3", "A share can require an access code", "the code is delivered separately from the link, and a wrong code is refused and recorded", "P0"),
    ("SHR-4", "A share can be limited to named email addresses", "a forwarded link does not work for an unnamed recipient", "P0"),
    ("SHR-5", "A share can be view-only, and this is enforced server-side", "requesting the document as a download is refused, not merely hidden in the interface", "P0"),
    ("SHR-6", "A share can cap the number of downloads", "the link closes itself once the cap is reached", "P1"),
    ("SHR-7", "A shared view can be watermarked with the recipient and the time", "a screenshot of the shared document identifies who it was sent to", "P1"),
    ("SHR-8", "A share can be revoked with immediate effect", "the next request fails, with no cached grace period", "P0"),
    ("SHR-9", "Sharing is refused when it contradicts the classification", "the refusal states which rule stopped it, rather than failing generically", "P0"),
    ("SHR-10", "The sender can see how the recipient engaged", "opens, time spent and which pages held attention are reported", "P1"),
    ("SHR-11", "A customer's own website can present documents to the public", "an external site retrieves permitted records through an interface, with no accounts for the public", "P2"),
]

WFL = [
    ("WFL-1", "A workflow starts when a record is filed into a folder", "no one has to remember to start it", "P1"),
    ("WFL-2", "A workflow starts on index-field criteria, combinable", "contracts above a value and of a named type route differently from the rest", "P1"),
    ("WFL-3", "Steps assign to a person, a department or a role", "a role assignment reaches whoever holds the role at that moment, not a fixed individual", "P1"),
    ("WFL-4", "A step confers the access needed to complete it, for its duration only", "the approver can open what they must approve without a standing grant, and loses it when the task closes", "P1"),
    ("WFL-5", "Steps run in sequence or in parallel", "a parallel step can require a stated number of several approvers", "P2"),
    ("WFL-6", "An overdue step escalates to a named alternative", "escalation happens on a schedule without intervention and is recorded", "P1"),
    ("WFL-7", "A workflow is built in the browser without code", "a department head composes a two-step approval unaided", "P1"),
    ("WFL-8", "People are notified of what awaits them, and can choose how", "notification preferences are set per person and per folder, on filing, change, approval and deletion", "P1"),
    ("WFL-9", "Outstanding tasks are visible on arrival", "a dashboard lists what is waiting for the person, oldest first", "P1"),
]

SIG = [
    ("SIG-1", "A signature can be requested on a record from inside the system", "the signer receives it without an account and without a third-party service", "P1"),
    ("SIG-2", "A signature can be drawn, typed or applied from a stored mark", "all three produce a signature fixed to a position on the page", "P1"),
    ("SIG-3", "Every signature carries evidence sufficient for a dispute", "who signed, when, from which address, on which exact edition, sealed against later alteration", "P1"),
    ("SIG-4", "Certificate-based signing for documents that require it", "the signature validates in third-party readers", "P2"),
    ("SIG-5", "Forms are built in the browser and published", "a form is composed without code and made available internally or externally", "P2"),
    ("SIG-6", "A submission becomes a record and can start a workflow", "the submission is filed, indexed, searchable, and triggers routing", "P2"),
]

GOV = [
    ("GOV-1", "Every consequential action is recorded", "who, what, when, from where, on which record — including refusals and views", "P0"),
    ("GOV-2", "The record of actions cannot be altered by anyone", "the database itself refuses modification and deletion, so the guarantee does not depend on application code or on trusting an administrator", "P0"),
    ("GOV-3", "Tampering is detectable, not merely prevented", "an integrity check recomputes the trail on demand and names the first entry that disagrees", "P0"),
    ("GOV-4", "The trail exports for an auditor", "a date range exports to a file an auditor can verify independently", "P0"),
    ("GOV-5", "Anyone with access to a record can see that record's own history", "without needing administrative rights or asking anyone", "P1"),
    ("GOV-6", "Retention schedules are set per document type", "a schedule states how long a record is kept and what happens at the end", "P0"),
    ("GOV-7", "Disposition requires review before destruction, where configured", "a named person confirms, and the confirmation is recorded", "P1"),
    ("GOV-8", "A legal hold suspends all destruction", "a held record cannot be deleted or purged by anyone, including the highest role, until released", "P0"),
    ("GOV-9", "Deletion is recoverable for a stated window", "a deleted record is restorable with its history intact until the window elapses", "P0"),
    ("GOV-10", "Reports by date range, cabinet and person", "a compliance officer produces activity and holdings reports unaided", "P1"),
    ("GOV-11", "A person's data can be located and exported on request", "a data subject request under the Nigeria Data Protection Act is answerable within the statutory period", "P0"),
]

OFF = [
    ("OFF-1", "A selection of records is taken offline in one action", "a folder or a search result is taken offline together, not document by document", "P1"),
    ("OFF-2", "Offline records are readable with no connection at all", "reading works on a flight or during an outage, with no server contact", "P1"),
    ("OFF-3", "Work done offline is queued and applied on reconnection", "nothing is lost and nothing is applied twice", "P1"),
    ("OFF-4", "Conflicting offline edits are surfaced, never silently resolved", "a person is shown both versions and chooses", "P2"),
    ("OFF-5", "Cached records stay encrypted and obey classification", "the most sensitive class is never cached on any device, and a time limit applies to the class below it", "P0"),
    ("OFF-6", "Revoking a device wipes what it holds", "cached records become unreadable at the next opportunity, without the holder's cooperation", "P1"),
    ("OFF-7", "Full function on a phone, including capture and approval", "a manager approves and a field officer files, from a phone, without a desktop", "P1"),
    ("OFF-8", "Usable on an intermittent connection", "the interface degrades rather than failing, and states plainly what is unavailable", "P0"),
]

ADM = [
    ("ADM-1", "Every administrative task is performed in a browser", "nothing requires software installed on a desktop, ever — including document types, retention, security and connections", "P0"),
    ("ADM-2", "People are invited, suspended and removed by an administrator", "suspension preserves history and immediately ends sessions and shares the person created", "P0"),
    ("ADM-3", "An administrator sees a person's effective access and why", "the resolved answer and the rules producing it are both shown", "P1"),
    ("ADM-4", "A tenancy can be branded", "logo, colour and sign-in appearance are set by the customer without our involvement", "P1"),
    ("ADM-5", "Administrators can work across several tenancies at once where entitled", "switching does not require signing out, and each tenancy's data stays separate", "P2"),
    ("ADM-6", "A dashboard shows what needs attention on arrival", "tasks, recent records and items awaiting review, scoped to the person", "P1"),
    ("ADM-7", "Storage location is configurable per tenancy", "a customer's records can be placed on infrastructure they nominate", "P2"),
]

PLT = [
    ("PLT-1", "A tenancy is provisioned without engineering involvement", "an operator creates a customer, its first administrator and its address, in minutes", "P0"),
    ("PLT-2", "Operating the platform confers no sight of customer records", "the operator realm cannot read, search or export any tenancy's documents, and cannot hold documents itself", "P0"),
    ("PLT-3", "Suspending or closing a tenancy requires a recorded reason", "the reason is written to both the operator's and the customer's trail and cannot be edited afterwards", "P0"),
    ("PLT-4", "Entitlement is enforced without contacting a server", "a self-hosted deployment with no outbound connectivity still honours its limits", "P0"),
    ("PLT-5", "Entitlement cannot be raised by editing the database", "changing a seat count directly has no effect", "P0"),
    ("PLT-6", "Seats can be sold as reserved or as a shared pool", "a reserved seat is always available to its holder; a pooled seat is released when its holder becomes inactive", "P1"),
    ("PLT-7", "A pooled seat is never refused without a way forward", "a person turned away is told when one is expected, or can request release — being told only to come back later is not acceptable", "P1"),
    ("PLT-8", "External recipients never consume a seat", "a customer sharing with a thousand counterparties pays nothing further", "P0"),
    ("PLT-9", "Usage is metered for billing", "storage, seats and activity are reportable per tenancy per period", "P1"),
    ("PLT-10", "A customer can leave with their records", "a complete export of documents and metadata in an open format, obtainable without our assistance", "P0"),
]

NFR = [
    ("NFR-1", "Runs on any modern browser, on any operating system", "no Windows requirement anywhere in the product, server or client", "P0"),
    ("NFR-2", "A folder of a thousand records opens in under two seconds", "measured at the 95th percentile on a typical Nigerian broadband connection, not on a developer's machine", "P0"),
    ("NFR-3", "Usable on a slow or intermittent connection", "the first screen is usable within five seconds on a 3G connection", "P1"),
    ("NFR-4", "Records are encrypted in transit and at rest", "stored bytes are unreadable without the platform's keys, and keys are not held beside the data", "P0"),
    ("NFR-5", "Nigerian data residency available on request", "a customer's records and backups remain in-country, contractually and technically", "P0"),
    ("NFR-6", "Compliant with the Nigeria Data Protection Act", "lawful basis, subject rights, breach notification and retention are all supported by the product, not only by policy", "P0"),
    ("NFR-7", "SOC 2 Type II certified", "an unqualified report covering security and availability, held and renewed", "P1"),
    ("NFR-8", "99.5% monthly availability for the managed service", "measured and published, with credits defined in the contract", "P0"),
    ("NFR-9", "Recoverable within four hours, losing no more than one hour of work", "demonstrated by a restore rehearsal, not by a backup existing", "P0"),
    ("NFR-10", "Accessible to WCAG 2.1 AA", "operable by keyboard throughout and usable with a screen reader — required for public-sector procurement", "P1"),
    ("NFR-11", "British English, with dates and currency in local convention", "no American spelling in customer-facing text; naira and day-month-year throughout", "P0"),
    ("NFR-12", "Everything the interface does is available through a documented interface", "a customer can integrate without asking us for an undocumented route", "P1"),
]

GROUPS = [
    ("A", "Tenancy and identity", TEN, None),
    ("B", "Filing structure and access", FIL, None),
    ("C", "Document types", TYP,
     "The backbone of the product. Search filters, retention rules, workflow triggers, automatic "
     "indexing and per-type watermarking all key off this, so it precedes them all."),
    ("D", "Capture and intake", CAP, None),
    ("E", "Search", SRC, None),
    ("F", "Viewing, editing and collaboration", VEW, None),
    ("G", "External sharing", SHR, None),
    ("H", "Workflow and approvals", WFL, None),
    ("I", "Signatures and forms", SIG, None),
    ("J", "Governance, retention and evidence", GOV, None),
    ("K", "Offline and mobile", OFF, None),
    ("L", "Administration", ADM, None),
    ("M", "Platform operation and licensing", PLT, None),
]


def build():
    doc = BaseDocTemplate(
        str(OUT), pagesize=A4,
        title="Dossiro — Product Requirements",
        author="Calm Global",
        subject="What Dossiro must do: 133 requirements with acceptance conditions",
        leftMargin=22 * mm, rightMargin=22 * mm, topMargin=24 * mm, bottomMargin=24 * mm,
    )
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[Frame(22 * mm, 30 * mm, 166 * mm, 215 * mm, id="c")],
                     onPage=cover_page),
        PageTemplate(id="body", frames=[Frame(22 * mm, 24 * mm, 166 * mm, 253 * mm, id="b")],
                     onPage=body_page),
    ])

    total = sum(len(g[2]) for g in GROUPS) + len(NFR)
    p0 = sum(1 for g in GROUPS for r in g[2] if r[3] == "P0") + sum(1 for r in NFR if r[3] == "P0")

    f = []

    # ---- cover ----
    f += [
        Spacer(1, 96 * mm),
        p("PRODUCT REQUIREMENTS  ·  v1.0", "kicker"),
        p("Dossiro", "title"),
        p("What the product must do to be sold to Nigerian enterprises and public bodies as a "
          "browser-delivered document management system. This document states requirements, not "
          "progress.", "standfirst"),
        Spacer(1, 16),
    ]
    ft = Table([[
        [p("REQUIREMENTS", "factLabel"), p(f"{total} across 14 areas", "factValue")],
        [p("LAUNCH SCOPE", "factLabel"), p(f"{p0} must-haves", "factValue")],
        [p("MARKET", "factLabel"), p("Nigeria first", "factValue")],
    ]], colWidths=[55 * mm, 55 * mm, 56 * mm])
    ft.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, RULE),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("LEFTPADDING", (1, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    f += [ft, NextPageTemplate("body"), PageBreak()]

    # ---- front matter ----
    f += section("PURPOSE", "What this document is")
    f += [
        p("The definition of done for Dossiro. Every requirement below is written so that it can be "
          "judged true or false, and carries the condition under which it is accepted.", "lede"),
        p("Priorities are fixed against a single question: <b>can Dossiro be sold without this?</b>"),
        plain_table(["Priority", "Meaning"], [
            [pri_cell("P0"), p("Cannot launch without it. A buyer in this category will refuse the product, or a regulator will.", "cellsoft")],
            [pri_cell("P1"), p("Needed within two quarters of launch. Its absence loses competitive deals but not every deal.", "cellsoft")],
            [pri_cell("P2"), p("Expected eventually. Its absence is survivable and can be named honestly in a sales conversation.", "cellsoft")],
            [pri_cell("Later"), p("Deliberately deferred. Recorded so the decision is not re-argued.", "cellsoft")],
        ], [22 * mm, 144 * mm]),
    ]

    f += section("CONTEXT", "The problem being solved")
    f += [
        p("Nigerian enterprises, banks, hospitals and public agencies hold their records in shared "
          "drives, email and paper. They are increasingly required — by regulators, by auditors, by "
          "the Nigeria Data Protection Act, and by their own boards — to control who can see a record "
          "and to show afterwards who did."),
        p("The established products in this market are Windows-era software: a Windows-only server, a "
          "desktop administration tool, a Java desktop client, per-seat licences priced for a "
          "different economy, and a deployment that needs a partner on site. They work, and they are "
          "what buyers compare against, but they impose an IT burden most Nigerian organisations do "
          "not want and a cost most cannot justify."),
        p("<b>Dossiro's opportunity is the gap between the compliance requirement and the delivery "
          "model.</b> The compliance posture is not negotiable and must be matched. The delivery "
          "model — install, maintain, administer from a desktop, one database at a time — is where an "
          "incumbent can be beaten outright."),
    ]

    f += section("SUCCESS", "Business objectives")
    f += [plain_table(["Objective", "Measured by"], [
        [p("A customer can be live without an engineer visiting", "cell"), p("Time from signed contract to first document filed, target under one hour", "cellsoft")],
        [p("Administration never requires software on a desktop", "cell"), p("Every administrative task completable in a browser. No exceptions.", "cellsoft")],
        [p("The audit position survives scrutiny", "cell"), p("An external auditor accepts the trail as evidence without supplementary explanation", "cellsoft")],
        [p("Price at a level the market can pay", "cell"), p("Total first-year cost below the incumbent's licence cost alone", "cellsoft")],
        [p("Records stay in the country when required", "cell"), p("Nigerian data residency available on request, contractually", "cellsoft")],
    ], [72 * mm, 94 * mm])]

    f += [PageBreak()]
    f += section("WHO FOR", "Users")
    f += [plain_table(["User", "Needs", "Fails if"], [
        [p("<b>Records officer</b>", "cell"), p("To capture a stack of paper, have it named and filed correctly, and find it again in seconds", "cellsoft"), p("Filing takes longer than the shared drive it replaced", "cellsoft")],
        [p("<b>Department head</b>", "cell"), p("To control who in their unit sees what, approve what needs approving, and share with counterparties safely", "cellsoft"), p("They must ask IT to change a permission", "cellsoft")],
        [p("<b>Compliance officer</b>", "cell"), p("To answer \"who opened this, and when\" without asking anyone, and to export that answer", "cellsoft"), p("The trail is incomplete, or could have been edited", "cellsoft")],
        [p("<b>IT administrator</b>", "cell"), p("To connect existing identity, set policy once, and not be the bottleneck for daily requests", "cellsoft"), p("Routine administration requires them at all", "cellsoft")],
        [p("<b>External counterparty</b>", "cell"), p("To open exactly what was sent to them, without an account", "cellsoft"), p("They are asked to register, or can reach more than intended", "cellsoft")],
        [p("<b>Platform operator</b>", "cell"), p("To provision, suspend and meter customers, without the ability to read their records", "cellsoft"), p("Operating the platform grants sight of customer data", "cellsoft")],
    ], [34 * mm, 74 * mm, 58 * mm])]

    f += section("STRATEGY", "The product bets")
    f += [
        p("Five decisions the requirements assume. Stated here so a requirement derived from them is "
          "not later questioned in isolation."),
    ]
    f += bullets([
        "<b>Browser-first, with no desktop component at all</b>, including administration. Incumbents "
        "administer from a Windows desktop tool; matching that concedes the clearest advantage available.",
        "<b>Multi-tenant SaaS as the default delivery.</b> Self-hosting is offered where a regulator "
        "demands it, not as the standard path.",
        "<b>A customer configures their own document types</b>, without a developer. A product without "
        "this is a file store with permissions.",
        "<b>Capability is not divided into purchasable modules.</b> Workflow, retention, notifications, "
        "indexing and search are one product.",
        "<b>Text extraction and AI assistance are core, not an upsell.</b> The proposal is always "
        "confirmed by a person before anything is renamed or moved.",
    ])

    f += section("VOCABULARY", "The language the product speaks")
    f += [
        p("Buyers already have words for these things, learned from the products they use today. "
          "Dossiro uses those words rather than inventing better ones."),
        plain_table(["Term", "Means"], [
            [p("<b>Tenancy</b>", "cell"), p("One customer organisation. Its own people, structure, records and address.", "cellsoft")],
            [p("<b>Cabinet</b>", "cell"), p("A top-level division of the filing structure — Finance, Legal, Human Resources.", "cellsoft")],
            [p("<b>Drawer</b>", "cell"), p("A division within a cabinet. May be locked, requiring a passcode even from someone whose role would otherwise permit entry.", "cellsoft")],
            [p("<b>Folder</b>", "cell"), p("Nests without limit beneath a drawer.", "cellsoft")],
            [p("<b>Record</b>", "cell"), p("A document and all its versions, its type, its index fields and its history.", "cellsoft")],
            [p("<b>Classification</b>", "cell"), p("How sensitive a record is, independent of who may reach it.", "cellsoft")],
        ], [34 * mm, 132 * mm]),
    ]

    # ---- requirement groups ----
    for letter, heading, rows, lede in GROUPS:
        f += [PageBreak()]
        f += section(f"REQUIREMENTS · {letter}", heading)
        if lede:
            f += [p(lede, "lede")]
        if letter == "K":
            f += [panel("WHERE THE CATEGORY IS WEAKEST",
                        "Incumbent web clients require a connection to take a record offline, handle "
                        "one document at a time, and cannot work independently of the server — while "
                        "the desktop client that did this properly is being retired. This is the "
                        "clearest opening in the market, and these requirements are set deliberately "
                        "higher than the competition."),
                  Spacer(1, 8)]
        f += [reqs(rows)]
        if letter == "C":
            f += [Spacer(1, 8),
                  panel("DEPENDENCY",
                        "TYP-1 to TYP-3 block SRC-4, GOV-4, WFL-2 and CAP-6. Sequencing them late "
                        "delays a quarter of the product.")]

    f += [PageBreak()]
    f += section("BEYOND FEATURES", "Non-functional requirements")
    f += [reqs(NFR)]

    f += [PageBreak()]
    f += section("BOUNDARIES", "Out of scope")
    f += [
        p("Recorded so these are not revisited without a decision."),
        plain_table(["Not building", "Why"], [
            [p("A collaborative document editor", "cell"), p("Embedded from an existing product. Building one is not justifiable at any realistic budget.", "cellsoft")],
            [p("A desktop client", "cell"), p("The entire strategic position is that one is unnecessary. Building one concedes it.", "cellsoft")],
            [p("Our own text-recognition engine", "cell"), p("A solved problem with good components available.", "cellsoft")],
            [p("Accounting, ERP or case management", "cell"), p("Dossiro holds records and integrates. It does not become the system of record for a business process.", "cellsoft")],
            [p("Physical records tracking", "cell"), p("Barcode tracking of paper in a warehouse is a different product.", "cellsoft")],
            [p("Per-module pricing", "cell"), p("A deliberate rejection of the incumbent model, not an omission.", "cellsoft")],
        ], [56 * mm, 110 * mm]),
    ]

    f += section("SEQUENCE", "Release phases")
    f += [
        p("Phases follow dependency, not preference. Document types come first because a quarter of "
          "the product keys off them, and text extraction second because capture, search and "
          "automatic indexing all wait on it."),
        plain_table(["Phase", "Contains", "Ready when"], [
            [p("<b>1 · Sellable</b>", "cell"),
             p("All P0. Tenancy, filing, access, document types, capture with text extraction, search, sharing, the audit trail, retention and legal hold, browser administration, provisioning and licensing.", "cellsoft"),
             p("A customer can be provisioned, file their records, control access, share safely, and satisfy an auditor — with nothing installed.", "cellsoft")],
            [p("<b>2 · Competitive</b>", "cell"),
             p("P1. Workflow and notifications, signatures, annotation and redaction, offline and mobile, automatic indexing, reports, seat pooling, SOC 2.", "cellsoft"),
             p("Dossiro wins a head-to-head evaluation against an incumbent on capability, not only on price and delivery.", "cellsoft")],
            [p("<b>3 · Extending</b>", "cell"),
             p("P2. Forms, co-editing, semantic search, public portal, external lookups, configuration portability, certificate signing.", "cellsoft"),
             p("The remaining gaps against the category are closed and the product leads where incumbents have withdrawn.", "cellsoft")],
        ], [30 * mm, 68 * mm, 68 * mm]),
    ]

    f += section("UNRESOLVED", "Open questions")
    f += [p("These need answers from the business, not from engineering.")]
    f += bullets([
        "<b>Pricing shape.</b> Per seat, per tenancy, or per volume of records? PLT-6 and PLT-9 cannot "
        "be specified precisely until this is settled.",
        "<b>Reserved and pooled seats — is the complexity worth it?</b> It matches what buyers know, "
        "and pooling makes an occasional user affordable. It is also the incumbent's most disliked "
        "behaviour. Offering one simple model may be the stronger position.",
        "<b>Which regulated sector is targeted first?</b> Banking, health and public sector each add "
        "requirements — health in particular adds a standard we have not scoped.",
        "<b>Hosting location.</b> NFR-5 requires Nigerian residency on request. Whether that is the "
        "default for all customers is a cost and latency decision.",
        "<b>Is self-hosting offered at launch or withheld?</b> It widens the addressable market and "
        "multiplies the support burden.",
        "<b>Migration from what?</b> Most buyers hold records in shared drives and in an incumbent "
        "system. Whether import tooling is a product feature or a service offering changes Phase 1.",
    ])
    f += [
        Spacer(1, 12),
        p("Dossiro · Calm Global · Lagos and Abuja. Requirements v1.0, 19 September 2026. Each "
          "requirement is written to be judged true or false; where one cannot yet be, it is an open "
          "question above rather than a requirement here.", "note"),
    ]

    doc.build(f)
    print(f"wrote {OUT}  ({OUT.stat().st_size // 1024} KB)  {total} requirements, {p0} at P0")


if __name__ == "__main__":
    build()
