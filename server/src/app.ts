import cors from "cors";
import express from "express";
import { corsOptions } from "./config/cors.js";
import type { AgentToolReadRepository } from "./repositories/agentTool.repository.js";
import {
  NoopAgentToolReadRepository,
  PostgresAgentToolReadRepository,
} from "./repositories/agentTool.repository.js";
import type { AgentRunRepository } from "./repositories/agentRun.repository.js";
import { PostgresAgentRunRepository } from "./repositories/agentRun.repository.js";
import type { ExtractionEvalRepository } from "./repositories/extractionEval.repository.js";
import {
  NoopExtractionEvalRepository,
  PostgresExtractionEvalRepository,
} from "./repositories/extractionEval.repository.js";
import type { KnowledgeRepository } from "./repositories/knowledge.repository.js";
import { PostgresKnowledgeRepository } from "./repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "./repositories/noteLink.repository.js";
import { PostgresNoteLinkRepository } from "./repositories/noteLink.repository.js";
import type { NoteCardPositionRepository } from "./repositories/noteCardPosition.repository.js";
import { PostgresNoteCardPositionRepository } from "./repositories/noteCardPosition.repository.js";
import type { ProposalRepository } from "./repositories/proposal.repository.js";
import { PostgresProposalRepository } from "./repositories/proposal.repository.js";
import type { RawNoteRepository } from "./repositories/rawNote.repository.js";
import { PostgresRawNoteRepository } from "./repositories/rawNote.repository.js";
import type { RawSourceRepository } from "./repositories/rawSource.repository.js";
import { PostgresRawSourceRepository } from "./repositories/rawSource.repository.js";
import type { TopicRepository } from "./repositories/topic.repository.js";
import { PostgresTopicRepository } from "./repositories/topic.repository.js";
import { createAskRoutes } from "./routes/ask.routes.js";
import { createAgentRunRoutes } from "./routes/agentRun.routes.js";
import { createDashboardRoutes } from "./routes/dashboard.routes.js";
import { createNoteLinkRoutes } from "./routes/noteLink.routes.js";
import { createNoteCardPositionRoutes } from "./routes/noteCardPosition.routes.js";
import { createProposalRoutes } from "./routes/proposal.routes.js";
import { createRawNoteRoutes } from "./routes/rawNote.routes.js";
import { createRawSourceRoutes } from "./routes/rawSource.routes.js";
import { createTopicRoutes } from "./routes/topic.routes.js";
import {
  AgentRunQueueService,
  type CompileAgentRunnerFactory,
} from "./services/agentRunQueue.service.js";
import { DashboardService } from "./services/dashboard.service.js";
import {
  NoopEmbeddingService,
  OpenAIEmbeddingService,
  type EmbeddingService,
} from "./services/embedding.service.js";
import { NoteLinkService } from "./services/noteLink.service.js";
import { NoteCardPositionService } from "./services/noteCardPosition.service.js";
import { PhaseOneWorkflowService } from "./services/phaseOneWorkflow.service.js";
import { ProposalService } from "./services/proposal.service.js";
import { RawNoteService } from "./services/rawNote.service.js";
import { RawSourceService } from "./services/rawSource.service.js";
import { TopicService } from "./services/topic.service.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { AskService, type AskAnswerer } from "./services/ask.service.js";
import type { WikiIndexer } from "./services/wikiIndexer.service.js";

export type AppDependencies = {
  rawNoteRepository?: RawNoteRepository;
  rawSourceRepository?: RawSourceRepository | null;
  knowledgeRepository?: KnowledgeRepository;
  noteLinkRepository?: NoteLinkRepository;
  noteCardPositionRepository?: NoteCardPositionRepository;
  proposalRepository?: ProposalRepository;
  agentRunRepository?: AgentRunRepository;
  extractionEvalRepository?: ExtractionEvalRepository;
  agentToolReadRepository?: AgentToolReadRepository;
  topicRepository?: TopicRepository;
  wikiIndexer?: WikiIndexer;
  /** Compile loop runner factory. Defaults to the deterministic scripted runner;
   * production wires the LLM-backed runner here. */
  compileAgentRunnerFactory?: CompileAgentRunnerFactory;
  askAnswerer?: AskAnswerer;
  embeddingService?: EmbeddingService;
  enablePhaseOneWorkflow?: boolean;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const rawNoteRepository = dependencies.rawNoteRepository ?? new PostgresRawNoteRepository();
  const rawSourceRepository =
    dependencies.rawSourceRepository === undefined
      ? dependencies.rawNoteRepository
        ? null
        : new PostgresRawSourceRepository()
      : dependencies.rawSourceRepository;
  const topicRepository = dependencies.topicRepository ?? new PostgresTopicRepository();
  const topicService = new TopicService(topicRepository);
  const knowledgeRepository = dependencies.knowledgeRepository ?? new PostgresKnowledgeRepository();
  const noteLinkRepository = dependencies.noteLinkRepository ?? new PostgresNoteLinkRepository();
  const noteCardPositionRepository =
    dependencies.noteCardPositionRepository ?? new PostgresNoteCardPositionRepository();
  const proposalRepository = dependencies.proposalRepository ?? new PostgresProposalRepository();
  const agentRunRepository = dependencies.agentRunRepository ?? new PostgresAgentRunRepository();
  const usingDefaultRepositories =
    !dependencies.rawNoteRepository &&
    dependencies.rawSourceRepository === undefined &&
    !dependencies.knowledgeRepository &&
    !dependencies.noteLinkRepository &&
    !dependencies.noteCardPositionRepository &&
    !dependencies.proposalRepository &&
    !dependencies.agentRunRepository &&
    !dependencies.agentToolReadRepository &&
    !dependencies.topicRepository;
  const extractionEvalRepository =
    dependencies.extractionEvalRepository ??
    (usingDefaultRepositories
      ? new PostgresExtractionEvalRepository()
      : new NoopExtractionEvalRepository());
  const agentToolReadRepository =
    dependencies.agentToolReadRepository ??
    (usingDefaultRepositories
      ? new PostgresAgentToolReadRepository()
      : new NoopAgentToolReadRepository());
  const embeddingService =
    dependencies.embeddingService ??
    (usingDefaultRepositories ? new OpenAIEmbeddingService() : new NoopEmbeddingService());
  const enablePhaseOneWorkflow = dependencies.enablePhaseOneWorkflow ?? true;
  const phaseOneWorkflowService = enablePhaseOneWorkflow
    ? new PhaseOneWorkflowService(
        rawNoteRepository,
        knowledgeRepository,
        proposalRepository,
        agentRunRepository,
      )
    : null;
  const proposalService = new ProposalService(
    proposalRepository,
    knowledgeRepository,
    noteLinkRepository,
    embeddingService,
  );
  const dashboardService = new DashboardService(knowledgeRepository, embeddingService);
  const noteLinkService = new NoteLinkService(noteLinkRepository);
  const noteCardPositionService = new NoteCardPositionService(noteCardPositionRepository);
  const askService = new AskService(
    knowledgeRepository,
    noteLinkRepository,
    embeddingService,
    undefined,
    dependencies.askAnswerer,
  );
  const agentRunQueueService = new AgentRunQueueService(
    agentRunRepository,
    knowledgeRepository,
    noteLinkRepository,
    rawNoteRepository,
    proposalRepository,
    dependencies.wikiIndexer,
    rawSourceRepository,
    extractionEvalRepository,
    agentToolReadRepository,
    dependencies.compileAgentRunnerFactory,
  );
  const rawSourceService = rawSourceRepository
    ? new RawSourceService(
        rawSourceRepository,
        rawNoteRepository,
        enablePhaseOneWorkflow ? agentRunQueueService : null,
      )
    : null;
  const rawNoteService = new RawNoteService(
    rawNoteRepository,
    phaseOneWorkflowService,
    enablePhaseOneWorkflow ? agentRunQueueService : null,
    proposalRepository,
    agentRunRepository,
    rawSourceRepository,
  );

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/topics", createTopicRoutes(topicService));
  app.use(createAskRoutes(askService));
  app.use("/raw-notes", createRawNoteRoutes(rawNoteService));
  if (rawSourceService) {
    app.use("/sources", createRawSourceRoutes(rawSourceService));
  }
  if (phaseOneWorkflowService) {
    app.use(
      "/agent-runs",
      createAgentRunRoutes(
        phaseOneWorkflowService,
        agentRunRepository,
        agentRunQueueService,
        extractionEvalRepository,
      ),
    );
  }
  app.use("/update-proposals", createProposalRoutes(proposalService));
  app.use("/note-links", createNoteLinkRoutes(noteLinkService));
  app.use("/note-card-positions", createNoteCardPositionRoutes(noteCardPositionService));
  app.use(createDashboardRoutes(dashboardService));
  app.use(errorHandler);

  return app;
}
