import cors from "cors";
import express from "express";
import { corsOptions } from "./config/cors.js";
import type { AgentRunRepository } from "./repositories/agentRun.repository.js";
import { PostgresAgentRunRepository } from "./repositories/agentRun.repository.js";
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
import { createAgentRunRoutes } from "./routes/agentRun.routes.js";
import { createDashboardRoutes } from "./routes/dashboard.routes.js";
import { createNoteLinkRoutes } from "./routes/noteLink.routes.js";
import { createNoteCardPositionRoutes } from "./routes/noteCardPosition.routes.js";
import { createProposalRoutes } from "./routes/proposal.routes.js";
import { createRawNoteRoutes } from "./routes/rawNote.routes.js";
import { AgentRunQueueService } from "./services/agentRunQueue.service.js";
import { DashboardService } from "./services/dashboard.service.js";
import { NoteLinkService } from "./services/noteLink.service.js";
import { NoteCardPositionService } from "./services/noteCardPosition.service.js";
import { PhaseOneWorkflowService } from "./services/phaseOneWorkflow.service.js";
import { ProposalService } from "./services/proposal.service.js";
import { RawNoteService } from "./services/rawNote.service.js";
import { errorHandler } from "./middleware/errorHandler.js";

export type AppDependencies = {
  rawNoteRepository?: RawNoteRepository;
  knowledgeRepository?: KnowledgeRepository;
  noteLinkRepository?: NoteLinkRepository;
  noteCardPositionRepository?: NoteCardPositionRepository;
  proposalRepository?: ProposalRepository;
  agentRunRepository?: AgentRunRepository;
  enablePhaseOneWorkflow?: boolean;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const rawNoteRepository = dependencies.rawNoteRepository ?? new PostgresRawNoteRepository();
  const knowledgeRepository = dependencies.knowledgeRepository ?? new PostgresKnowledgeRepository();
  const noteLinkRepository = dependencies.noteLinkRepository ?? new PostgresNoteLinkRepository();
  const noteCardPositionRepository =
    dependencies.noteCardPositionRepository ?? new PostgresNoteCardPositionRepository();
  const proposalRepository = dependencies.proposalRepository ?? new PostgresProposalRepository();
  const agentRunRepository = dependencies.agentRunRepository ?? new PostgresAgentRunRepository();
  const enablePhaseOneWorkflow = dependencies.enablePhaseOneWorkflow ?? true;
  const phaseOneWorkflowService = enablePhaseOneWorkflow
    ? new PhaseOneWorkflowService(
        rawNoteRepository,
        knowledgeRepository,
        proposalRepository,
        agentRunRepository,
      )
    : null;
  const rawNoteService = new RawNoteService(rawNoteRepository, phaseOneWorkflowService);
  const proposalService = new ProposalService(
    proposalRepository,
    knowledgeRepository,
    noteLinkRepository,
  );
  const dashboardService = new DashboardService(knowledgeRepository);
  const noteLinkService = new NoteLinkService(noteLinkRepository);
  const noteCardPositionService = new NoteCardPositionService(noteCardPositionRepository);
  const agentRunQueueService = new AgentRunQueueService(
    agentRunRepository,
    knowledgeRepository,
    noteLinkRepository,
  );

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/raw-notes", createRawNoteRoutes(rawNoteService));
  if (phaseOneWorkflowService) {
    app.use(
      "/agent-runs",
      createAgentRunRoutes(phaseOneWorkflowService, agentRunRepository, agentRunQueueService),
    );
  }
  app.use("/update-proposals", createProposalRoutes(proposalService));
  app.use("/note-links", createNoteLinkRoutes(noteLinkService));
  app.use("/note-card-positions", createNoteCardPositionRoutes(noteCardPositionService));
  app.use(createDashboardRoutes(dashboardService));
  app.use(errorHandler);

  return app;
}
