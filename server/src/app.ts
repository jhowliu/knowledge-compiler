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
import type { ProposalRepository } from "./repositories/proposal.repository.js";
import { PostgresProposalRepository } from "./repositories/proposal.repository.js";
import type { RawSourceRepository } from "./repositories/rawSource.repository.js";
import { PostgresRawSourceRepository } from "./repositories/rawSource.repository.js";
import { createAskRoutes } from "./routes/ask.routes.js";
import { createAgentRunRoutes } from "./routes/agentRun.routes.js";
import { createDashboardRoutes } from "./routes/dashboard.routes.js";
import { createProposalRoutes } from "./routes/proposal.routes.js";
import { createRawSourceRoutes } from "./routes/rawSource.routes.js";
import {
  AgentRunQueueService,
  type CompileAgentRunnerFactory,
} from "./services/agentRunQueue.service.js";
import { CompileRawNoteHandler } from "./services/agentRun/compileRawNoteHandler.js";
import { DashboardService } from "./services/dashboard.service.js";
import { ProposalService } from "./services/proposal.service.js";
import { RawSourceService } from "./services/rawSource.service.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { AskService, type AskAnswerer } from "./services/ask.service.js";
import type { WikiIndexer } from "./services/wikiIndexer.service.js";

export type AppDependencies = {
  rawSourceRepository?: RawSourceRepository | null;
  knowledgeRepository?: KnowledgeRepository;
  proposalRepository?: ProposalRepository;
  agentRunRepository?: AgentRunRepository;
  extractionEvalRepository?: ExtractionEvalRepository;
  agentToolReadRepository?: AgentToolReadRepository;
  wikiIndexer?: WikiIndexer;
  /** Compile loop runner factory. Defaults to the deterministic scripted runner;
   * production wires the LLM-backed runner here. */
  compileAgentRunnerFactory?: CompileAgentRunnerFactory;
  askAnswerer?: AskAnswerer;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const usingDefaultRepositories =
    dependencies.rawSourceRepository === undefined &&
    !dependencies.knowledgeRepository &&
    !dependencies.proposalRepository &&
    !dependencies.agentRunRepository &&
    !dependencies.agentToolReadRepository;
  const rawSourceRepository =
    dependencies.rawSourceRepository === undefined
      ? usingDefaultRepositories
        ? new PostgresRawSourceRepository()
        : null
      : dependencies.rawSourceRepository;
  const knowledgeRepository = dependencies.knowledgeRepository ?? new PostgresKnowledgeRepository();
  const proposalRepository = dependencies.proposalRepository ?? new PostgresProposalRepository();
  const agentRunRepository = dependencies.agentRunRepository ?? new PostgresAgentRunRepository();
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
  const proposalService = new ProposalService(proposalRepository, knowledgeRepository);
  const dashboardService = new DashboardService(knowledgeRepository, rawSourceRepository);
  const askService = new AskService(
    knowledgeRepository,
    dependencies.askAnswerer,
    rawSourceRepository,
  );
  const compileRawNoteHandler = new CompileRawNoteHandler(
    agentRunRepository,
    knowledgeRepository,
    proposalRepository,
    dependencies.wikiIndexer,
    rawSourceRepository,
    extractionEvalRepository,
    agentToolReadRepository,
    dependencies.compileAgentRunnerFactory,
  );
  const agentRunQueueService = new AgentRunQueueService(
    agentRunRepository,
    [compileRawNoteHandler],
  );
  const rawSourceService = rawSourceRepository
    ? new RawSourceService(
        rawSourceRepository,
        agentRunQueueService,
        proposalRepository,
        agentRunRepository,
      )
    : null;

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use(createAskRoutes(askService));
  if (rawSourceService) {
    app.use("/sources", createRawSourceRoutes(rawSourceService));
  }
  app.use(
    "/agent-runs",
    createAgentRunRoutes(agentRunRepository, agentRunQueueService, extractionEvalRepository),
  );
  app.use("/update-proposals", createProposalRoutes(proposalService));
  app.use(createDashboardRoutes(dashboardService));
  app.use(errorHandler);

  return app;
}
