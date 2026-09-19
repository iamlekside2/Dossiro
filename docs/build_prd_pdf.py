"""
Builds docs/Dossiro-PRD.pdf from the same content as docs/prd.html.

    python docs/build_prd_pdf.py

Kept as a script rather than a one-off export so the PDF can be regenerated
when the document changes, instead of drifting away from the page it came from.
The design follows the product's own system: square corners, rules rather than
shadows, one blue.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parent / "Dossiro-PRD.pdf"

# ---- palette, taken from the product ------------------------------------

INK = colors.HexColor("#141A22")
INK_SOFT = colors.HexColor("#5B6674")
INK_FAINT = colors.HexColor("#8792A1")
ACCENT = colors.HexColor("#25508C")
RULE = colors.HexColor("#D8DEE7")
RULE_FIRM = colors.HexColor("#B9C3D1")
PANEL = colors.HexColor("#F4F6F9")
PANEL_ALT = colors.HexColor("#EAEEF4")

BUILT = colors.HexColor("#1B6B52")
BUILT_BG = colors.HexColor("#E6F2ED")
PARTIAL = colors.HexColor("#8A5C07")
PARTIAL_BG = colors.HexColor("#F9EFD9")
ABSENT = colors.HexColor("#626C7A")
ABSENT_BG = colors.HexColor("#ECEDF0")


def register_fonts() -> tuple[str, str, str, str]:
    """Segoe UI and Consolas where present, Helvetica/Courier otherwise.

    The PDF should not silently fall back to a face that changes the measure,
    so the names are returned rather than assumed by the styles below.
    """
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
        mono = "Cons"
    except Exception:
        mono = "Courier"

    return body, bold, semi, mono


BODY_F, BOLD_F, SEMI_F, MONO_F = register_fonts()

# ---- styles --------------------------------------------------------------

S = {
    "title": ParagraphStyle(
        "title", fontName=BOLD_F, fontSize=44, leading=46, textColor=INK, spaceAfter=14
    ),
    "standfirst": ParagraphStyle(
        "standfirst", fontName=BODY_F, fontSize=12.5, leading=18.5, textColor=INK_SOFT
    ),
    "kicker": ParagraphStyle(
        "kicker", fontName=MONO_F, fontSize=8, leading=12, textColor=INK_FAINT, spaceAfter=10
    ),
    "eyebrow": ParagraphStyle(
        "eyebrow", fontName=MONO_F, fontSize=7.5, leading=11, textColor=ACCENT, spaceAfter=3
    ),
    "h2": ParagraphStyle(
        "h2", fontName=BOLD_F, fontSize=19, leading=23, textColor=INK, spaceAfter=7
    ),
    "h3": ParagraphStyle(
        "h3", fontName=BOLD_F, fontSize=12, leading=16, textColor=INK, spaceBefore=13, spaceAfter=4
    ),
    "body": ParagraphStyle(
        "body", fontName=BODY_F, fontSize=9.7, leading=15, textColor=INK, alignment=TA_LEFT,
        spaceAfter=8,
    ),
    "lede": ParagraphStyle(
        "lede", fontName=BODY_F, fontSize=11, leading=17, textColor=INK_SOFT, spaceAfter=10
    ),
    "bullet": ParagraphStyle(
        "bullet", fontName=BODY_F, fontSize=9.7, leading=14.5, textColor=INK,
        leftIndent=11, bulletIndent=2, spaceAfter=4,
    ),
    "cell": ParagraphStyle("cell", fontName=BODY_F, fontSize=8.6, leading=12.6, textColor=INK),
    "cellsoft": ParagraphStyle(
        "cellsoft", fontName=BODY_F, fontSize=8.6, leading=12.6, textColor=INK_SOFT
    ),
    "cellmono": ParagraphStyle("cellmono", fontName=MONO_F, fontSize=8.2, leading=12.4, textColor=INK),
    "th": ParagraphStyle("th", fontName=MONO_F, fontSize=7, leading=10, textColor=INK_FAINT),
    "panel": ParagraphStyle(
        "panel", fontName=BODY_F, fontSize=9.4, leading=14.5, textColor=INK
    ),
    "panelTitle": ParagraphStyle(
        "panelTitle", fontName=MONO_F, fontSize=7, leading=11, textColor=INK_FAINT, spaceAfter=4
    ),
    "code": ParagraphStyle("code", fontName=MONO_F, fontSize=8.6, leading=13.5, textColor=INK),
    "note": ParagraphStyle("note", fontName=BODY_F, fontSize=8.6, leading=13, textColor=INK_SOFT),
    "factLabel": ParagraphStyle(
        "factLabel", fontName=MONO_F, fontSize=6.8, leading=10, textColor=INK_FAINT
    ),
    "factValue": ParagraphStyle("factValue", fontName=SEMI_F, fontSize=9.6, leading=13, textColor=INK),
}


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(t, S["bullet"], bulletText="\u2013") for t in items]


def chip(label, kind):
    """Status, as a bordered cell rather than coloured text alone."""
    fg, bg = {"built": (BUILT, BUILT_BG), "partial": (PARTIAL, PARTIAL_BG)}.get(
        kind, (ABSENT, ABSENT_BG)
    )
    style = ParagraphStyle(
        f"chip{kind}", fontName=MONO_F, fontSize=6.8, leading=9.5, textColor=fg
    )
    t = Table([[Paragraph(label.upper(), style)]], colWidths=[26 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.5, fg),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def table(headers, rows, widths):
    data = [[Paragraph(h.upper(), S["th"]) for h in headers]]
    data += rows
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PANEL),
                ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE_FIRM),
                ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def panel(title, text):
    """A bordered aside with an accent stripe on the left, as on the page."""
    inner = [p(title, "panelTitle"), p(text, "panel")]
    t = Table([[inner]], colWidths=[165 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def codeblock(lines):
    t = Table([[ [Paragraph(l, S["code"]) for l in lines] ]], colWidths=[165 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return t


def roadmap_item(title, status, kind, summary, needs, approach):
    rows = []
    head = Table(
        [[Paragraph(title, ParagraphStyle("it", fontName=SEMI_F, fontSize=10.5, leading=14,
                                          textColor=INK)), chip(status, kind)]],
        colWidths=[130 * mm, 28 * mm],
    )
    head.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    rows.append(head)
    if summary:
        rows.append(p(summary, "body"))
    rows.append(p("NEEDS", "panelTitle"))
    rows.append(p(needs, "note"))
    rows.append(Spacer(1, 4))
    rows.append(p("APPROACH", "panelTitle"))
    rows.append(p(approach, "note"))

    stripe = {"built": BUILT, "partial": PARTIAL}.get(kind, ABSENT)
    t = Table([[rows]], colWidths=[165 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("LINEBEFORE", (0, 0), (0, -1), 2.2, stripe),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return KeepTogether([t, Spacer(1, 7)])


def section(eyebrow, heading):
    return [Spacer(1, 10), p(eyebrow, "eyebrow"), p(heading, "h2")]


# ---- page furniture ------------------------------------------------------

def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(INK)
    canvas.setLineWidth(1.6)
    canvas.line(22 * mm, 250 * mm, 188 * mm, 250 * mm)
    canvas.setFont(MONO_F, 7.5)
    canvas.setFillColor(INK_FAINT)
    canvas.drawString(22 * mm, 18 * mm, "CALM GLOBAL  ·  LAGOS AND ABUJA")
    canvas.drawRightString(188 * mm, 18 * mm, "CONFIDENTIAL DRAFT")
    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFont(MONO_F, 7)
    canvas.setFillColor(INK_FAINT)
    canvas.drawString(22 * mm, 285 * mm, "DOSSIRO  ·  PRODUCT REQUIREMENTS")
    canvas.drawRightString(188 * mm, 285 * mm, "v0.1  ·  19 SEPTEMBER 2026")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(22 * mm, 282 * mm, 188 * mm, 282 * mm)
    canvas.line(22 * mm, 20 * mm, 188 * mm, 20 * mm)
    canvas.setFillColor(INK_SOFT)
    canvas.setFont(MONO_F, 7.5)
    canvas.drawRightString(188 * mm, 14 * mm, str(canvas.getPageNumber()))
    canvas.restoreState()


def build():
    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        title="Dossiro — Product Requirements",
        author="Calm Global",
        subject="What Dossiro is, what works today, and what remains",
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=24 * mm,
        bottomMargin=24 * mm,
    )

    cover_frame = Frame(22 * mm, 30 * mm, 166 * mm, 215 * mm, id="cover", showBoundary=0)
    body_frame = Frame(22 * mm, 24 * mm, 166 * mm, 253 * mm, id="body", showBoundary=0)

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="body", frames=[body_frame], onPage=body_page),
    ])

    f = []

    # ---- cover ----------------------------------------------------------
    # NextPageTemplate before the break, or the cover furniture repeats on
    # every following page.
    f += [
        Spacer(1, 96 * mm),
        p("PRODUCT REQUIREMENTS  ·  v0.1", "kicker"),
        p("Dossiro", "title"),
        p(
            "A multi-tenant document management system for organisations that must prove what "
            "happened to a record, not merely store it. This document describes what Dossiro is, "
            "what it does today, what it does not do yet, and what each remaining piece depends on.",
            "standfirst",
        ),
        Spacer(1, 16),
    ]

    facts = [[
        [p("STATUS", "factLabel"), p("Working build, pre-release", "factValue")],
        [p("VERIFIED BY", "factLabel"), p("93 assertions", "factValue")],
        [p("SCHEMA", "factLabel"), p("49 tables, 24 enums", "factValue")],
    ]]
    ft = Table(facts, colWidths=[55 * mm, 55 * mm, 56 * mm])
    ft.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, RULE),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("LEFTPADDING", (1, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    f += [ft, NextPageTemplate("body"), PageBreak()]

    # ---- what it is -----------------------------------------------------
    f += section("DEFINITION", "What Dossiro is")
    f += [
        p("A web application where an organisation files its records, controls who may see each "
          "one, shares individual documents outside the company under conditions it sets, and can "
          "afterwards prove exactly who did what.", "lede"),
        p("Every customer organisation is a <b>tenant</b>: its own users, its own filing structure, "
          "its own records, reachable at its own web address. One deployment serves many tenants "
          "and nothing crosses between them."),
        p("The distinguishing claim is not storage, which is commodity. It is that the record of "
          "activity is <b>evidence</b>. Every consequential action is written to an append-only, "
          "hash-chained trail that the database itself refuses to alter, and the chain can be "
          "recomputed on demand to prove it has not been touched. An organisation that must answer "
          "to an auditor, a regulator or a court can show its working."),
    ]

    f += section("ORIGIN", "Why it exists")
    f += [
        p("Calm Global evaluated a commercial document management product as a reseller. The "
          "evaluation established two things: there is real demand among Nigerian enterprises and "
          "public bodies for compliant document management, and the available products are "
          "desktop-era software sold at licence costs that assume a different market."),
        p("Dossiro is the response. A browser-first system built for organisations that need the "
          "compliance posture without the desktop deployment, priced and hosted for the market it "
          "serves. It is designed to be sold as a managed service, with self-hosting available for "
          "buyers whose regulator requires it."),
    ]

    # ---- who ------------------------------------------------------------
    f += section("USERS", "Who uses it")
    f += [
        p("Three populations touch the system, and the boundaries between them are the thing most "
          "worth getting right. Roughly half of the verification suite consists of proving what "
          "each population <i>cannot</i> do."),
        table(
            ["Population", "Who they are", "What they can reach"],
            [
                [p("<b>Platform operator</b>", "cell"), p("Calm Global staff running the service", "cellsoft"),
                 p("Creates, suspends and closes tenants. Cannot read any tenant's documents; the "
                   "platform organisation is barred by the database from holding a document at all.", "cellsoft")],
                [p("<b>Tenant user</b>", "cell"), p("Staff at a customer organisation", "cellsoft"),
                 p("Everything their role and grants allow, inside their own tenant only.", "cellsoft")],
                [p("<b>External recipient</b>", "cell"), p("A counterparty holding a share link. No account.", "cellsoft"),
                 p("Exactly one document, under the conditions set on that link, and nothing else.", "cellsoft")],
            ],
            [32 * mm, 48 * mm, 86 * mm],
        ),
        Spacer(1, 12),
        p("Tiers within a tenant", "h3"),
        p("A tier is the ceiling on what a person may ever do. Grants on individual folders and "
          "documents then decide what they actually reach."),
        table(
            ["Tier", "Intended for", "Notable limit"],
            [
                [p("SYSTEM_ADMIN", "cellmono"), p("Technical owner", "cellsoft"),
                 p("Full control, including permanent purge and audit export", "cellsoft")],
                [p("ORG_ADMIN", "cellmono"), p("The organisation's administrator", "cellsoft"),
                 p("Everything except purging a record under legal hold", "cellsoft")],
                [p("MANAGER", "cellmono"), p("Head of a department", "cellsoft"),
                 p("Approves, grants access, shares confidential records externally", "cellsoft")],
                [p("CONTRIBUTOR", "cellmono"), p("Staff who file day to day", "cellsoft"),
                 p("Creates and edits; cannot grant access to others", "cellsoft")],
                [p("VIEWER", "cellmono"), p("Read-only staff", "cellsoft"),
                 p("Reads what they are granted; files nothing", "cellsoft")],
                [p("EXTERNAL", "cellmono"), p("Contractors and partners with accounts", "cellsoft"),
                 p("Only what is explicitly granted, nothing by inheritance", "cellsoft")],
            ],
            [32 * mm, 48 * mm, 86 * mm],
        ),
    ]

    # ---- realms ---------------------------------------------------------
    f += [PageBreak()]
    f += section("STRUCTURE", "The three realms")
    f += [
        p("Operating the platform and using the product are different jobs, so they are different "
          "places."),
        p("1. The operator console", "h3"),
        p("Where Calm Global administers the business: provisioning tenants, suspending them for "
          "non-payment, issuing licences. Suspending or closing a tenant locks a whole company out "
          "of its own records, so it <b>requires a written reason</b>, and that reason is recorded "
          "in both the platform's audit trail and the tenant's own, where nobody can later edit it."),
        p("2. The tenant workbench", "h3"),
        p("Where the customer's staff work: the filing cabinet, search, sharing, and the audit "
          "trail. This is the product as most people experience it."),
        p("3. Tenant administration", "h3"),
        p("Where a customer administers themselves: people, roles, departments, branches, web "
          "addresses. Currently a section of the workbench; splitting it into its own area is an "
          "agreed next step."),
        Spacer(1, 6),
        panel("A DELIBERATE SEPARATION",
              "Calm Global appears twice: once as the operator, and once as an ordinary tenant "
              "holding its own records. Those are separate organisations with separate data. The "
              "operator console cannot read the records tenancy, and vice versa."),
    ]

    # ---- workbench ------------------------------------------------------
    f += section("SCOPE", "The workbench, area by area")
    f += [
        p("The workbench has eleven areas. Five run on real data. The rest are designed and "
          "modelled but not yet connected, and the interface says so on every screen rather than "
          "showing convincing sample data unlabelled.", "lede"),
        panel("WHY THE LABELLING MATTERS",
              "Sample data is a demo hazard: someone opens Invoices, sees six invoices, and "
              "believes them. Every area that is not live is marked in the interface, and panes "
              "that still show the designer's illustration beside a genuine record are marked "
              "individually."),
        Spacer(1, 10),
    ]

    areas = [
        ("Repository", "Live", "built", "The filing cabinet. Folders nest without limit; documents carry immutable version history, classification and an owner."),
        ("Search", "Live", "built", "Full-text search inside document bodies, ranked, with the matched phrase quoted. Scanned pages are not searchable until OCR exists."),
        ("Sharing", "Live", "built", "Every share link in the organisation, filtered by state: active, expired, download cap reached, revoked."),
        ("Audit", "Live", "built", "The event log, filtered in the database, with the hash chain verified alongside every page."),
        ("Administration", "Part live", "partial", "People, roles, branches and web addresses are live. Remaining scopes are still sample."),
        ("Capture", "Not built", "absent", "Scanning and device intake. Needs the OCR pipeline."),
        ("Ingest", "Not built", "absent", "Channel intake. WhatsApp and email intake work at the API level but this screen is not connected to them."),
        ("Invoices", "Not built", "absent", "Invoice extraction and matching. The data model is complete; no extraction runs."),
        ("E-forms", "Not built", "absent", "Form builder and submissions. Schema only."),
        ("HR", "Not built", "absent", "HR document handling. Blocked behind user-defined document types."),
        ("Approvals", "Not built", "absent", "Workflow routing. Workflow tables exist; nothing drives them."),
    ]
    f += [table(
        ["Area", "State", "What it does"],
        [[p(f"<b>{a}</b>", "cell"), chip(s, k), p(d, "cellsoft")] for a, s, k, d in areas],
        [30 * mm, 30 * mm, 106 * mm],
    )]

    f += [
        Spacer(1, 12),
        p("Verified working today", "h3"),
    ]
    f += bullets([
        "Folders with unlimited nesting, move, and subtree delete",
        "Documents with immutable version history and restore",
        "Role and classification based access control, with inheritance and explicit deny",
        "Share links with expiry, download caps, access codes and view-only enforcement",
        "Metadata and full-text search with date-range filters",
        "Hash-chained audit trail with integrity verification",
        "Per-page reading analytics on shared documents",
        "Recycle bin, restore, and legal hold",
        "WhatsApp and email upload and download with verified sender identity",
        "A delta sync feed for offline clients (reading side)",
    ])

    # ---- access ---------------------------------------------------------
    f += [PageBreak()]
    f += section("CORE MODEL", "How access is decided")
    f += [
        p("Two independent systems both have to say yes: <b>permissions</b>, which come from a "
          "person's role and say what kind of thing they may do at all, and <b>grants</b>, which "
          "are attached to folders and documents and say which specific records they may touch."),
        p("Levels", "h3"),
        p("A grant carries one level, and the levels are ordered: NONE, READ, DOWNLOAD, WRITE, "
          "APPROVE, MANAGE, OWNER. DOWNLOAD is deliberately separate from READ: being allowed to "
          "look at a contract on screen is not the same as being allowed to take a copy away."),
        p("Resolution", "h3"),
        p("A grant can be made to a person, a department, or a role, and can be attached to a "
          "document or to a folder, where it flows down to everything beneath. When several apply, "
          "the most specific scope wins: a rule on the document beats one on its folder, which "
          "beats one on the folder above. At equal specificity, <b>deny beats allow</b>."),
        panel("THE CASE THAT PROVES IT",
              "A clerk in Accounts Payable inherits write access to the whole Finance cabinet "
              "through their department, but carries an explicit deny on the Invoices subfolder. "
              "They can file into Finance and are refused on Invoices. This is asserted on every "
              "verification run."),
        Spacer(1, 8),
        p("Classification", "h3"),
        p("Independently of who you are, every document carries a classification (PUBLIC, INTERNAL, "
          "CONFIDENTIAL or RESTRICTED) and the classification constrains what may be done with it "
          "regardless of permission. A RESTRICTED record cannot be shared outside the organisation "
          "at all; a CONFIDENTIAL one cannot be shared as an open link with no named recipient, and "
          "only a manager or administrator may share it externally."),
        p("A folder that is marked as not inheriting access is sealed: grants from above do not "
          "reach into it, and only explicit grants apply. This is how an HR cabinet stays closed to "
          "an administrator who can otherwise see everything."),
    ]

    # ---- evidence -------------------------------------------------------
    f += section("THE DIFFERENTIATOR", "Evidence and the audit trail")
    f += [
        p("Every consequential action writes an entry. Each entry hashes its own content together "
          "with the hash of the entry before it, so the log forms a chain: change or remove any "
          "entry and every subsequent hash stops agreeing. An integrity endpoint recomputes the "
          "chain and reports the first entry that disagrees."),
        p("The guarantee does not rest on application code being well behaved. A database trigger "
          "rejects UPDATE and DELETE on the audit table outright, so no role, including the owner, "
          "and including anyone with direct database access through the application's own "
          "credentials, can quietly edit history. Both refusals are asserted on every verification "
          "run."),
        p("Writes are serialised per organisation with an advisory lock, so two simultaneous "
          "actions cannot chain off the same predecessor and fork the history."),
        panel("KNOWN LIMIT, STATED PLAINLY",
              "The hashed content covers the action, the actor and the resource. It does not yet "
              "cover the originating address, the resource name, or the metadata payload. Those "
              "fields cannot be edited in practice because the trigger blocks it, but they are not "
              "cryptographically bound. Widening the hash would invalidate every existing entry, so "
              "this is a decision to take before real customer data lands."),
    ]

    # ---- sharing --------------------------------------------------------
    f += section("EXTERNAL ACCESS", "Sharing outside the organisation")
    f += [
        p("A share link lets someone without an account reach exactly one document. The person "
          "issuing it sets the terms: an expiry, an optional access code, a download cap, whether "
          "downloading is permitted at all, whether the document is watermarked, and which email "
          "addresses may open it."),
        p("Opening a protected link is two steps. The recipient first authorises with the access "
          "code and receives a short-lived signed ticket; the bytes are only served against that "
          "ticket. A ticket issued for one link does not work on another. View-only is enforced at "
          "the point the bytes are served, not merely hidden in the interface: requesting the same "
          "document as an attachment is refused."),
        p("Revocation is immediate. A revoked link returns <i>gone</i> on the next request, and "
          "every open is written to the audit trail."),
    ]

    # ---- architecture ---------------------------------------------------
    f += [PageBreak()]
    f += section("HOW IT IS BUILT", "Architecture")
    f += [table(
        ["Part", "Built with", "Notes"],
        [
            [p("API", "cell"), p("NestJS 11 · TypeScript 5.7", "cellmono"), p("18 modules, port 4010", "cellsoft")],
            [p("Web app", "cell"), p("React 18 · Vite 6", "cellmono"), p("The workbench, port 3015", "cellsoft")],
            [p("Marketing site", "cell"), p("Next.js 14", "cellmono"), p("Separate deployment, port 3020", "cellsoft")],
            [p("Database", "cell"), p("PostgreSQL 18", "cellmono"), p("49 tables, 24 enum types", "cellsoft")],
            [p("Database access", "cell"), p("node-postgres 8.23", "cellmono"), p("No ORM. Hand-written parameterised SQL.", "cellsoft")],
            [p("Storage", "cell"), p("Local filesystem", "cellmono"), p("Driver is pluggable; S3 is a decision not yet taken", "cellsoft")],
        ],
        [32 * mm, 48 * mm, 86 * mm],
    )]
    f += [
        Spacer(1, 12),
        p("No ORM, deliberately", "h3"),
        p("Every query is written by hand as parameterised SQL. The access-control resolution alone "
          "involves recursive folder walks, department hierarchies and specificity ordering; "
          "expressing that through an ORM's abstraction obscured what the database was actually "
          "being asked to do. Row types are generated from the live schema, so a column that "
          "changes shape breaks the build rather than failing at runtime."),
        p("Three details worth knowing", "h3"),
    ]
    f += bullets([
        "<b>Transactions propagate implicitly.</b> A nested transaction joins the one already "
        "running rather than deadlocking against it, so a service can be called standalone or "
        "inside a larger operation without knowing which.",
        "<b>Timestamps are UTC end to end.</b> The Postgres driver reads and writes timestamps in "
        "the machine's local time by default, which silently shifts every date by the server's "
        "offset. This is corrected in three places at once: the type parser, parameter "
        "serialisation, and the session timezone.",
        "<b>Request origin is ambient.</b> The address and user agent are carried in "
        "request-scoped context, so an audit entry records where an action came from without each "
        "call site remembering to pass it.",
    ])
    f += [
        p("Verification", "h3"),
        p("93 assertions across five suites, run against a live database and a running API rather "
          "than mocks. They exist to prove the guarantees the product is sold on, not to chase "
          "coverage. Notably they include what the <i>database</i> enforces on its own: the "
          "append-only trigger, foreign keys, and the platform organisation's inability to hold a "
          "document."),
    ]

    # ---- data -----------------------------------------------------------
    f += section("SCHEMA", "The data model")
    f += [
        p("49 tables. The ones that matter most to understanding the system:"),
        table(
            ["Table", "Holds"],
            [
                [p("organizations", "cellmono"), p("Tenants, plus the single platform organisation that runs the service", "cellsoft")],
                [p("users", "cellmono"), p("People. Email is unique <i>per organisation</i>, not globally, so a consultant can belong to two tenants.", "cellsoft")],
                [p("folders", "cellmono"), p("The cabinet tree, with a materialised path for subtree queries", "cellsoft")],
                [p("documents", "cellmono"), p("Records, each pointing at a current version", "cellsoft")],
                [p("document_versions", "cellmono"), p("Immutable history. A new edition never overwrites the previous one.", "cellsoft")],
                [p("document_index", "cellmono"), p("Extracted text for full-text search, separate from the document row", "cellsoft")],
                [p("access_grants", "cellmono"), p("Who may reach what, at which level, allow or deny", "cellsoft")],
                [p("share_links", "cellmono"), p("External links and their conditions", "cellsoft")],
                [p("audit_events", "cellmono"), p("The hash chain. Append-only, enforced by trigger.", "cellsoft")],
                [p("tenant_hostnames", "cellmono"), p("Which web address belongs to which tenant", "cellsoft")],
            ],
            [44 * mm, 122 * mm],
        ),
        Spacer(1, 10),
        p("Identifiers are generated in the application rather than by the database, so a row's id "
          "is known before it is written, which is what lets a folder's materialised path be "
          "correct in the insert itself rather than needing a follow-up update."),
        p("Migrations are plain SQL files applied by a small runner that records a checksum of "
          "each. A migration edited after it has been applied is detected and refused, rather than "
          "silently diverging between environments."),
        p("Licensing", "h3"),
        p("Licences are Ed25519-signed and verified offline, so a self-hosted deployment with no "
          "outbound connectivity still enforces its terms. Seat entitlement is read from the "
          "signature, never from a column in the database: editing the seat limit directly changes "
          "nothing, which is asserted on every verification run."),
    ]

    # ---- pending --------------------------------------------------------
    f += [PageBreak()]
    f += section("ROADMAP", "Not built yet")
    f += [
        p("Each of these is modelled in the database and has an agreed approach. What is listed is "
          "what must be true before it can be built, so that the decision is not re-litigated "
          "later.", "lede"),
        Spacer(1, 4),
    ]

    f += [
        roadmap_item(
            "OCR and batch PDF conversion", "Schema ready", "absent",
            "The gateway feature. Several other items are blocked behind it, because they need "
            "text that only OCR can produce.",
            "Redis for the job queue · a Python OCR service · a conversion container",
            "Job rows drive a queue. OCR runs in a separate Python service; conversion runs "
            "headless. Results feed the search index.",
        ),
        roadmap_item(
            "Intelligent indexing, naming and summarisation", "Schema ready", "absent", "",
            "An AI provider key · the pgvector extension · OCR text available",
            "Extracted text is chunked and embedded for semantic search. A model proposes a name, "
            "folder and tags for human confirmation; it never renames files unattended.",
        ),
        roadmap_item(
            "Invoice and HR document extraction", "Schema ready", "absent", "",
            "The OCR pipeline · a human review queue",
            "Line items get real columns so they can be aggregated and reconciled. Every "
            "extraction stays unverified until a person confirms it.",
        ),
        roadmap_item(
            "Workflow routing and approvals", "Schema ready", "absent", "",
            "Notification delivery · a workflow builder interface",
            "A definition is an ordered list of steps; each step creates a task for a person, "
            "department or role, and confers temporary access for the duration of that task.",
        ),
        roadmap_item(
            "E-signatures", "Schema ready", "absent", "",
            "PDF flattening · a certificate store for the later phase",
            "Signature positions are stored as fractions of the page so they survive any zoom. "
            "Drawn signatures first; certificate-based signing later. Every signature carries an "
            "evidence bundle for disputes.",
        ),
        roadmap_item(
            "E-forms", "Schema ready", "absent", "",
            "A form builder interface",
            "A form definition drives a renderer; a submission can merge into a template and start "
            "a workflow.",
        ),
        roadmap_item(
            "Live co-editing and Microsoft/Adobe integration", "Buy, don't build", "absent", "",
            "An embedded document server, or Microsoft registration",
            "Real-time co-authoring is embedded from an existing product. Building a collaborative "
            "editor is out of scope at any realistic budget, and this decision is recorded so it is "
            "not revisited.",
        ),
        roadmap_item(
            "Full offline editing", "Schema ready", "absent", "",
            "A desktop or mobile client · a conflict resolution model",
            "Offline reading and queued uploads already work through the sync feed. Bidirectional "
            "offline editing needs a version-vector model and its own client; it is a separate "
            "phase, not an extension of what exists.",
        ),
        roadmap_item(
            "SOC 2 readiness", "Mostly not code", "partial", "",
            "An auditor engagement · vendor agreements · a penetration test · 3 to 12 months of evidence",
            "The technical control surface is largely in place: hash-chained audit, encryption in "
            "transit, classification, retention, legal hold, session revocation. Certification "
            "itself is a programme, not a feature. Most buyers asking for SOC want SOC 2 Type II, "
            "which covers security; SOC 1 covers financial reporting controls.",
        ),
    ]

    f += [
        Spacer(1, 6),
        p("The largest gap", "h3"),
        panel("USER-DEFINED DOCUMENT TYPES",
              "Customers expect to define their own kinds of document, a Contract or a Personnel "
              "File, each with its own typed, indexed fields they can search on. The schema does "
              "not express this yet, and the HR area is blocked behind it. It is the clearest "
              "functional gap against established products in this market."),
    ]

    # ---- deployment and running -----------------------------------------
    f += [PageBreak()]
    f += section("DELIVERY", "Deployment")
    f += [
        p("Two models, the same software."),
        p("<b>Managed.</b> The default. A customer gets their own tenancy on Calm Global's platform "
          "at their own web address. Nothing to install, nothing to maintain."),
        p("<b>Self-hosted.</b> For buyers whose regulator requires records to stay on their own "
          "infrastructure. Licences verify offline precisely so this works without outbound "
          "connectivity."),
        p("A tenant's web address is what identifies them at sign-in. Visiting a tenant's own "
          "address settles which organisation is being signed into before anyone types anything; "
          "the shared sign-in asks only when the address settles nothing and the person belongs to "
          "more than one organisation."),
    ]

    f += section("PRACTICAL", "Running it locally")
    f += [
        codeblock([
            "npm run db:migrate&nbsp;&nbsp;&nbsp;&nbsp;# apply migrations",
            "npm run db:seed&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 278 documents across 17 folders",
            "npm run db:reset&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# drop, rebuild, reseed (guarded to local only)",
            "npm run verify&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 93 assertions",
        ]),
        Spacer(1, 10),
        p("The workbench runs at localhost:3015, the API at localhost:4010. Seeded tenants also "
          "answer on their own addresses (acme.localhost:3015, harbor.localhost:3015, "
          "records.localhost:3015), which is how the hostname-identifies-the-tenant behaviour can "
          "be exercised locally."),
        p("Seeded accounts", "h3"),
        table(
            ["Email", "Password", "Organisation and role"],
            [
                [p("admin@acme.test", "cellmono"), p("Dossiro!2026", "cellmono"), p("Acme Corporation — administrator, sees everything", "cellsoft")],
                [p("manager@acme.test", "cellmono"), p("Dossiro!2026", "cellmono"), p("Acme — manager, Finance and Shared", "cellsoft")],
                [p("clerk@acme.test", "cellmono"), p("Dossiro!2026", "cellmono"), p("Acme — contributor, denied on Invoices 2026", "cellsoft")],
                [p("client@partner.test", "cellmono"), p("Dossiro!2026", "cellmono"), p("Acme — external, Shared only, read-only", "cellsoft")],
                [p("ada@harborfreight.test", "cellmono"), p("HarborFreight!2026", "cellmono"), p("Harbor Freight — a second tenant, for isolation", "cellsoft")],
            ],
            [46 * mm, 36 * mm, 84 * mm],
        ),
        Spacer(1, 6),
        p("Development credentials for a local database only. They are in the seed file and are "
          "not secrets.", "note"),
    ]

    # ---- decisions ------------------------------------------------------
    f += section("OUTSTANDING", "Open decisions")
    f += [
        p("Storage backend", "h3"),
        p("Whether to add S3 as a storage driver. This is genuinely two separate questions that are "
          "easy to conflate: using object storage as the backend for document bytes, and exporting "
          "documents to a customer's own bucket as a published deliverable. The second must be "
          "classification-aware, because publishing a restricted record to a bucket the "
          "organisation does not control would defeat the entire access model."),
        p("The audit hash canonical", "h3"),
        p("Whether to widen the hashed content to cover the originating address and metadata. Doing "
          "so invalidates every existing entry, so it should be settled before real data lands."),
        p("Tenant administration split", "h3"),
        p("Agreed in principle: move tenant self-administration out of the workbench into its own "
          "area. Not started."),
        p("Preview and editing", "h3"),
        p("The document preview and editing panes are still the designer's illustration. A real "
          "preview needs the content stream and a viewer; editing is the buy-not-build decision "
          "recorded above."),
        Spacer(1, 14),
        p("Dossiro · Calm Global · Lagos and Abuja. This document describes a working pre-release "
          "build as of 19 September 2026. Where something is not built, it says so.", "note"),
    ]

    doc.build(f)
    print(f"wrote {OUT}  ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()
