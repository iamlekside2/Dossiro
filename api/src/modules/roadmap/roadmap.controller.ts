import { Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';

/**
 * Placeholder surface for the features that are modelled in the database but
 * not yet built.
 *
 * These live in one controller on purpose. Twelve near-empty modules would
 * look like architecture without being any; one honest list says exactly what
 * exists, what does not, and what each remaining piece depends on. Each block
 * moves into its own module as it is implemented.
 */

interface PendingFeature {
  feature: number | string | Array<number | string>;
  title: string;
  /** What has to be true before this can be built. */
  blockedBy: string[];
  /** The approach chosen, so the decision is not re-litigated later. */
  approach: string;
  schemaReady: boolean;
}

const ROADMAP: PendingFeature[] = [
  {
    feature: ['TEN-4', 'TEN-5'],
    title: 'Single sign-on',
    blockedBy: ['An identity provider to register against', 'Per-tenant provider configuration'],
    approach:
      'OIDC against Entra and Okta first, since both speak it and the tenancy already resolves from the hostname before sign-in. On-premises Active Directory is LDAP rather than OIDC and is a second, separate piece. Nothing of either exists yet: there is no schema, no provider record and no callback route. Recorded here because it is a P0 requirement and was being advertised as though it were a configuration step.',
    schemaReady: false,
  },
  {
    feature: [1, 3],
    title: 'OCR and batch PDF conversion',
    blockedBy: ['Redis for BullMQ', 'Python OCR sidecar', 'Gotenberg container'],
    approach:
      'ProcessingJob rows drive a BullMQ queue. OCR runs in a Python service (PaddleOCR); conversion runs in Gotenberg (headless LibreOffice). Results land in OcrPage and feed DocumentIndex.',
    schemaReady: true,
  },
  {
    feature: [5, 19],
    title: 'Intelligent indexing, naming and summarisation',
    blockedBy: ['ANTHROPIC_API_KEY', 'pgvector extension', 'OCR text available'],
    approach:
      'Chunk extracted text into DocumentChunk, embed, store in a pgvector column. Claude proposes a name, folder and tags into Document.suggestedName for human confirmation rather than renaming files unattended.',
    schemaReady: true,
  },
  {
    feature: [15, 16],
    title: 'Invoice and HR document extraction',
    blockedBy: ['OCR pipeline', 'Human review queue UI'],
    approach:
      'ExtractionResult holds the structured payload; InvoiceLineItem gets real columns so line items can be aggregated and reconciled. Every extraction stays unverified until a human confirms it.',
    schemaReady: true,
  },
  {
    feature: 14,
    title: 'E-signatures and scribbled signatures',
    blockedBy: ['pdf-lib flattening', 'Certificate store for PAdES'],
    approach:
      'SignatureField coordinates are stored as 0-1 fractions of the page so they survive any zoom. Drawn signatures are PNGs; certificate signing is a later phase. Every signature carries an evidence bundle for disputes.',
    schemaReady: true,
  },
  {
    feature: [20, 22],
    title: 'Microsoft/Adobe integration and live co-editing',
    blockedBy: ['OnlyOffice Document Server or Microsoft WOPI registration'],
    approach:
      'BUY, DO NOT BUILD. Real-time co-authoring is embedded via OnlyOffice or Office for the web over WOPI. WopiSession already models the short-lived token. Building an OT/CRDT editor is out of scope at any realistic budget.',
    schemaReady: true,
  },
  {
    feature: 12,
    title: 'Full offline editing with conflict resolution',
    blockedBy: ['Desktop/mobile client', 'Conflict resolution model'],
    approach:
      'Delta sync (GET /api/sync/changes) already covers offline reading and queued uploads. Bidirectional offline editing needs a version-vector model and its own client; it is a separate phase, not an extension of the sync endpoint.',
    schemaReady: true,
  },
  {
    feature: 21,
    title: 'SOC 2 / HIPAA readiness',
    blockedBy: ['Auditor engagement', 'Vendor BAAs', 'Penetration test', '3-12 months of evidence'],
    approach:
      'Mostly not code. The technical control surface is in place: hash-chained audit trail, encryption in transit, classification labels, retention policies, legal hold, session revocation. The certification itself is a programme, not a feature, and SOC 1 covers financial controls rather than security - most buyers actually want SOC 2 Type II.',
    schemaReady: true,
  },
];

@ApiTags('roadmap')
@Controller()
export class RoadmapController {
  @Public()
  @Get('roadmap')
  @ApiOperation({ summary: 'What is built, what is not, and what each remaining piece needs' })
  roadmap() {
    return {
      implemented: [
        'Folders with unlimited nesting, move and subtree delete (feature 4)',
        'Documents with immutable version history and restore (features 4, 12)',
        'Role and classification based access control with inheritance and deny (features 2, 8, 13)',
        'Share links with expiry, download caps, access codes and view-only mode (features 1, 18)',
        'Metadata and full-text search with date-range filters (features 6, 7)',
        'Hash-chained audit trail with integrity verification (feature 10)',
        'Per-page reading analytics (feature 23)',
        'Recycle bin, restore and legal hold (feature 24)',
        'WhatsApp and email upload/download with verified sender identity',
        'Delta sync feed for offline clients (feature 12, read side)',
        'Document types with index fields, and the roles allowed to file as each (TYP-1, TYP-3)',
        'Workflow routing and approvals, with escalation and access carried by the task (WFL-4, WFL-6)',
        'E-forms whose submissions become filed, indexed documents (feature 17)',
        'Retention policies and recorded disposition decisions (GOV-7)',
        'Personnel files assembled from records that name a person (feature 16, filing side)',
        'Text extraction so a document can be searched by its contents (feature 3, text layer only)',
        'Branches, and a web address per tenancy that resolves before sign-in (TEN-2)',
        'Break-glass support sessions a tenant approves, scopes and ends (PLT-2)',
      ],
      pending: ROADMAP,
    };
  }

  @Post('processing/jobs')
  @ApiOperation({ summary: 'Not implemented: queue an OCR or conversion job' })
  queueJob(): never {
    throw new HttpException(
      {
        message: 'Processing pipeline is not implemented yet.',
        needs: ['REDIS_URL', 'OCR_SERVICE_URL', 'GOTENBERG_URL'],
        see: 'GET /api/roadmap',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('ai/summarize')
  @ApiOperation({ summary: 'Not implemented: summarise a document (feature 19)' })
  summarize(): never {
    throw new HttpException(
      {
        message: 'AI summarisation is not implemented yet.',
        needs: ['AI_PROVIDER=anthropic', 'ANTHROPIC_API_KEY', 'extracted document text'],
        see: 'GET /api/roadmap',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
