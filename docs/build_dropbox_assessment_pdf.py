"""
Builds docs/Dossiro-Dropbox-Assessment.pdf.

    python docs/build_dropbox_assessment_pdf.py

Answers a question from the business: can Dossiro serve individuals, and can
it work like Dropbox? Written as an assessment rather than a position paper —
the capability table is the substance, and it is drawn from what is actually
in the repository today, not from the roadmap.
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

OUT = Path(__file__).resolve().parent / "Dossiro-Dropbox-Assessment.pdf"

INK = colors.HexColor("#141A22")
INK_SOFT = colors.HexColor("#5B6674")
INK_FAINT = colors.HexColor("#8792A1")
ACCENT = colors.HexColor("#25508C")
RULE = colors.HexColor("#D8DEE7")
RULE_FIRM = colors.HexColor("#B9C3D1")
PANEL = colors.HexColor("#F4F6F9")

# Status colours reuse the product's own semantics: green means it works,
# ochre means attention, red means blocked, grey means deliberately absent.
STATUS = {
    "Built": (colors.HexColor("#2F7D4F"), colors.HexColor("#EFF6F1")),
    "Part built": (colors.HexColor("#8A5A15"), colors.HexColor("#FDF8EF")),
    "Designed": (colors.HexColor("#3D5A80"), colors.HexColor("#E8EEF6")),
    "Not built": (colors.HexColor("#626C7A"), colors.HexColor("#ECEDF0")),
    "By choice": (colors.HexColor("#8C2F22"), colors.HexColor("#FBF0EE")),
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
        mono = "Cons"
    except Exception:
        mono = "Courier"
    return body, bold, semi, mono


BODY_F, BOLD_F, SEMI_F, MONO_F = register_fonts()

S = {
    "title": ParagraphStyle("title", fontName=BOLD_F, fontSize=38, leading=41, textColor=INK, spaceAfter=14),
    "standfirst": ParagraphStyle("standfirst", fontName=BODY_F, fontSize=12.5, leading=18.5, textColor=INK_SOFT),
    "kicker": ParagraphStyle("kicker", fontName=MONO_F, fontSize=8, leading=12, textColor=INK_FAINT, spaceAfter=10),
    "eyebrow": ParagraphStyle("eyebrow", fontName=MONO_F, fontSize=7.5, leading=11, textColor=ACCENT, spaceAfter=3),
    "h2": ParagraphStyle("h2", fontName=BOLD_F, fontSize=19, leading=23, textColor=INK, spaceAfter=7),
    "h3": ParagraphStyle("h3", fontName=BOLD_F, fontSize=12.5, leading=16, textColor=INK, spaceBefore=13, spaceAfter=4),
    "body": ParagraphStyle("body", fontName=BODY_F, fontSize=9.8, leading=15.2, textColor=INK, spaceAfter=8),
    "lede": ParagraphStyle("lede", fontName=BODY_F, fontSize=11.5, leading=17.5, textColor=INK_SOFT, spaceAfter=11),
    "bullet": ParagraphStyle("bullet", fontName=BODY_F, fontSize=9.8, leading=14.8, textColor=INK,
                             leftIndent=13, bulletIndent=2, spaceAfter=6),
    "cell": ParagraphStyle("cell", fontName=BODY_F, fontSize=8.8, leading=12.8, textColor=INK),
    "cellsoft": ParagraphStyle("cellsoft", fontName=BODY_F, fontSize=8.8, leading=12.8, textColor=INK_SOFT),
    "cellb": ParagraphStyle("cellb", fontName=SEMI_F, fontSize=8.8, leading=12.8, textColor=INK),
    "th": ParagraphStyle("th", fontName=MONO_F, fontSize=7, leading=10, textColor=INK_FAINT),
    "panel": ParagraphStyle("panel", fontName=BODY_F, fontSize=9.5, leading=14.8, textColor=INK),
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


def pill(label):
    fg, bg = STATUS[label]
    st = ParagraphStyle("pill" + label, fontName=MONO_F, fontSize=6.8, leading=9.5, textColor=fg)
    t = Table([[Paragraph(label.upper(), st)]], colWidths=[19 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.5, fg),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    return t


def table(headers, rows, widths, repeat=True):
    data = [[Paragraph(h.upper(), S["th"]) for h in headers]] + rows
    t = Table(data, colWidths=widths, repeatRows=1 if repeat else 0)
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


def panel(title, text, tone=ACCENT):
    inner = [p(title, "panelTitle"), p(text, "panel")]
    t = Table([[inner]], colWidths=[166 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, tone),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def section(eyebrow, heading):
    return [Spacer(1, 10), p(eyebrow, "eyebrow"), p(heading, "h2")]


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(INK)
    canvas.setLineWidth(1.6)
    canvas.line(22 * mm, 250 * mm, 188 * mm, 250 * mm)
    canvas.setFont(MONO_F, 7.5)
    canvas.setFillColor(INK_FAINT)
    canvas.drawString(22 * mm, 18 * mm, "CALM GLOBAL  ·  LAGOS AND ABUJA")
    canvas.drawRightString(188 * mm, 18 * mm, "COMMERCIAL IN CONFIDENCE")
    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFont(MONO_F, 7)
    canvas.setFillColor(INK_FAINT)
    canvas.drawString(22 * mm, 285 * mm, "DOSSIRO  ·  INDIVIDUAL USE AND FILE SYNC")
    canvas.drawRightString(188 * mm, 285 * mm, "23 SEPTEMBER 2026")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(22 * mm, 282 * mm, 188 * mm, 282 * mm)
    canvas.line(22 * mm, 20 * mm, 188 * mm, 20 * mm)
    canvas.setFillColor(INK_SOFT)
    canvas.setFont(MONO_F, 7.5)
    canvas.drawRightString(188 * mm, 14 * mm, str(canvas.getPageNumber()))
    canvas.restoreState()


# -- The capability assessment ------------------------------------------------
# Status is what is in the repository today, not what is planned.

CAPABILITIES = [
    ("Store files in folders",
     "Built",
     "Cabinets, drawers and folders, nesting without limit."),
    ("Keep every version, restore an old one",
     "Built",
     "Every edition is kept and any can be restored. Restoring creates a new edition rather than "
     "overwriting history, which Dropbox does not do."),
    ("Send a file to someone with no account",
     "Built",
     "And considerably stronger than Dropbox: expiry, access code, download caps, view-only "
     "enforced by the server, a watermark carrying the recipient's own email, and a report of "
     "which pages they read and for how long."),
    ("Search your files",
     "Built",
     "Name, metadata and the full text inside scanned pages. Dropbox does not read your scans."),
    ("Upload by dragging a file in",
     "Designed",
     "The drop zone is in the approved design. A morning's work, not a feature."),
    ("Capture from a phone camera",
     "Designed",
     "Specified as CAP-4, including edge detection. Same pipeline as a desk scanner."),
    ("Work offline and reconcile on reconnect",
     "Part built",
     "The server half exists today: a change feed with a moving cursor, device registration, and "
     "acknowledgement of what a device has seen. What is missing is the client that consumes it "
     "and the merge on the way back."),
    ("A desktop folder that syncs by itself",
     "Not built",
     "The single largest item in this document, and the only one that is properly a new product "
     "rather than a feature. Discussed in detail overleaf."),
    ("Anyone can sign themselves up",
     "By choice",
     "There is no registration endpoint anywhere in the system. The only way in is an invitation "
     "to an organisation that already exists. This is deliberate, not missing."),
    ("A free tier",
     "By choice",
     "Dossiro is priced against the cost of a compliance failure, not against a consumer's "
     "willingness to pay for storage."),
]

OPTIONS = [
    ("A",
     "Dropbox-like ease, inside the rules we already have",
     "One quarter",
     "Drag-and-drop upload, phone capture, an unfiled Inbox so nothing has to be classified at the "
     "moment it arrives, and the offline client that consumes the change feed already built. Every "
     "item is already an approved requirement; this is sequencing, not new scope.",
     "Most of the convenience, none of the conflict. Does not produce a desktop folder."),
    ("B",
     "A true desktop sync client",
     "Three quarters or more",
     "A file-system agent for Windows and macOS, selective sync, conflict detection and "
     "resolution, chunked transfer for large files, and an installer and update channel per "
     "platform. It also reverses the decision that there is no desktop component, which is "
     "currently our clearest advantage over the incumbent.",
     "Real capability, real cost, and a second product to support forever."),
    ("C",
     "A consumer product: self-serve signup, individual accounts, a free tier",
     "Not costed",
     "Registration, consumer billing, abuse and fraud handling, consumer support, and storage "
     "economics that only work at a scale we do not have.",
     "Competing with free products on their own ground. Not recommended."),
]


def build():
    doc = BaseDocTemplate(
        str(OUT), pagesize=A4,
        title="Dossiro — individual use and file sync",
        author="Calm Global",
        subject="Can Dossiro serve individuals, and can it work like Dropbox?",
        leftMargin=22 * mm, rightMargin=22 * mm, topMargin=24 * mm, bottomMargin=24 * mm,
    )
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[Frame(22 * mm, 30 * mm, 166 * mm, 215 * mm, id="c")],
                     onPage=cover_page),
        PageTemplate(id="body", frames=[Frame(22 * mm, 24 * mm, 166 * mm, 253 * mm, id="b")],
                     onPage=body_page),
    ])

    built = sum(1 for _, s, _ in CAPABILITIES if s == "Built")

    f = []

    # ---- cover ----
    f += [
        Spacer(1, 92 * mm),
        p("ASSESSMENT  ·  REQUESTED BY THE BOARD", "kicker"),
        p("Individual use<br/>and file sync", "title"),
        p("Can Dossiro serve individuals, and can it be made to work like Dropbox? "
          "An assessment of what it would take, what it would cost, and what it would cost us.",
          "standfirst"),
        Spacer(1, 16),
    ]
    ft = Table([[
        [p("QUESTION FROM", "factLabel"), p("The board", "factValue")],
        [p("SHORT ANSWER", "factLabel"), p("Partly, and yes — at a price", "factValue")],
        [p("RECOMMENDATION", "factLabel"), p("Option A", "factValue")],
    ]], colWidths=[55 * mm, 55 * mm, 56 * mm])
    ft.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, RULE),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("LEFTPADDING", (1, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    f += [ft, NextPageTemplate("body"), PageBreak()]

    # ---- the answer ----
    f += section("IN SHORT", "The answer in a paragraph")
    f += [
        p("A one-person business can use Dossiro today. A private individual filing holiday "
          "photographs cannot, because there is no way to sign yourself up — and that is a "
          "deliberate decision rather than an omission.", "lede"),
        p("On working like Dropbox, the honest answer is that we are closer than it appears. "
          f"Of the ten things people mean by “like Dropbox”, {built} are already built and two "
          "more are designed and waiting. The server half of file synchronisation exists in the "
          "product today. What we do not have, and would have to build from nothing, is the "
          "desktop folder itself — and that one item is most of the cost and all of the "
          "difficulty."),
        p("The rest of this document sets out what is there, what the one genuine obstacle is, "
          "and three options with their prices."),
    ]

    f += section("THE DIFFERENCE", "Why the two products are not the same shape")
    f += [
        p("<b>Dropbox is synchronisation-first.</b> Its purpose is to put your files on every "
          "machine you own and make them easy to send to anybody. It succeeds when a file is "
          "everywhere, instantly, with no thought required."),
        p("<b>Dossiro is evidence-first.</b> Its purpose is to control who may see a record and to "
          "prove afterwards who did. It succeeds when an auditor accepts the trail without asking "
          "a follow-up question."),
        p("That difference is not branding. It decides the architecture. In Dropbox you arrange "
          "folders for your own convenience; in Dossiro the filing structure <i>is</i> the access "
          "control, a folder you may not read does not appear at all, and sharing a confidential "
          "record with an uncleared colleague is refused rather than warned about."),
        panel("WORTH SAYING TO A CUSTOMER",
              "These are not competing products. An organisation can keep using Dropbox for "
              "working files and use Dossiro for the records it must be able to defend. Most of "
              "our customers will do exactly that, and saying so plainly is more credible than "
              "claiming to replace everything."),
    ]

    # ---- capability table ----
    f += [PageBreak()]
    f += section("THE ASSESSMENT", "Ten things people mean by “like Dropbox”")
    f += [
        p("Status is what exists in the system today, not what is planned. “By choice” marks the "
          "two items we have decided against rather than failed to reach."),
        table(
            ["Capability", "Status", "Where we stand"],
            [[p(name, "cellb"), pill(status), p(note, "cellsoft")] for name, status, note in CAPABILITIES],
            [46 * mm, 22 * mm, 98 * mm],
        ),
    ]

    # ---- the obstacle ----
    f += [PageBreak()]
    f += section("THE ONE REAL OBSTACLE", "A synced folder and an audit trail pull against each other")
    f += [
        p("This is the part worth understanding properly, because it is the reason a sync client "
          "is not simply a matter of effort.", "lede"),
        p("Dossiro's central promise is that every consequential action is recorded: who opened "
          "which record, when, and from where. That trail is the reason a bank or a ministry buys "
          "the product at all."),
        p("A synchronising desktop folder copies the bytes onto somebody's laptop. From that "
          "moment we cannot see what happens to them. The file can be opened a hundred times, "
          "copied to a memory stick, or attached to a personal email, and none of it reaches the "
          "trail. A naive sync client would quietly hollow out the thing we are selling."),
        p("<b>We have already solved this on paper.</b> The offline requirements say that cached "
          "records stay encrypted, that the most sensitive class is never cached on any device at "
          "all, that a time limit applies to the class below it, and that revoking a device makes "
          "everything it holds unreadable without the holder's cooperation. A sync client built to "
          "those rules is defensible to an auditor."),
        panel("THE PRACTICAL POINT",
              "The hard thinking behind safe synchronisation is done and approved. What remains is "
              "construction — a file-system agent per platform, conflict handling, and an update "
              "channel. That is an honest engineering estimate rather than a research problem, "
              "which is why Option B is expensive but not speculative."),
    ]

    # ---- options ----
    f += [PageBreak()]
    f += section("THE CHOICE", "Three options")
    f += [table(
        ["", "Option", "Cost", "What it involves", "Consequence"],
        [[p(k, "cellb"), p(name, "cellb"), p(cost, "cellsoft"), p(what, "cellsoft"), p(res, "cellsoft")]
         for k, name, cost, what, res in OPTIONS],
        [8 * mm, 32 * mm, 20 * mm, 62 * mm, 44 * mm],
    )]

    f += section("RECOMMENDATION", "Take Option A now and revisit Option B after launch")
    f += bullets([
        "<b>Option A is almost free.</b> Every part of it is already an approved requirement with a "
        "design behind it. Sequencing it earlier costs us nothing we were not going to spend.",
        "<b>It answers the real complaint.</b> When somebody says they want Dropbox, they usually "
        "mean they do not want to think about filing. An unfiled Inbox and drag-and-drop solve "
        "that; a synced folder is how Dropbox happened to solve it, not the requirement itself.",
        "<b>Option B should wait for evidence.</b> If customers ask for a desktop folder during the "
        "first two quarters of selling, we will know it is worth three quarters of engineering. At "
        "present we are guessing.",
        "<b>Option C should be declined plainly.</b> Consumer file storage is a market with "
        "excellent free products in it. We would be worse and more expensive, and it would pull "
        "the roadmap away from the customers who will actually pay.",
    ])

    f += section("ALSO WORTH KNOWING", "Two things that may be what was really being asked")
    f += [
        p("<b>People with no account already use Dossiro.</b> An external counterparty opens a "
          "share link without signing up for anything — passcode, expiry, view-only, watermarked "
          "with their own address — and they never consume a paid seat. If the question was "
          "whether outsiders can be included, the answer is that they already are."),
        p("<b>A one-person business is a supported customer.</b> Nothing in the architecture "
          "requires an organisation to be large. Setup currently assumes a company domain and an "
          "identity provider, which a sole practitioner will not have, but the steps are computed "
          "rather than fixed — so a small-tenancy path that skips domain verification and allows "
          "an ordinary password is a modest change, not a redesign."),
        p("In Nigeria specifically, the habit we are competing with is not Dropbox. It is WhatsApp. "
          "Dossiro already accepts documents sent by WhatsApp from verified senders, which is a "
          "better on-ramp for a small customer here than any desktop folder would be."),
        Spacer(1, 10),
        p("Prepared by the engineering team, 23 September 2026. Figures describe the system as it "
          "stands in the repository on that date; the two “by choice” rows are decisions the board "
          "can reverse, and the rest are statements of fact.", "note"),
    ]

    doc.build(f)
    print(f"wrote {OUT}  ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()
