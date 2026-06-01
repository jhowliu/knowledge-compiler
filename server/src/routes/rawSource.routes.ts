import { Router } from "express";
import { RawSourceController } from "../controllers/rawSource.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { RawSourceService } from "../services/rawSource.service.js";
import {
  createRawSourceSchema,
  createSourceFolderSchema,
  createSourceProjectSchema,
  moveRawSourceSchema,
  renameSourceFolderSchema,
  renameSourceProjectSchema,
  updateRawSourceSchema,
} from "../validators/rawSource.schemas.js";

export function createRawSourceRoutes(rawSourceService: RawSourceService) {
  const router = Router();
  const controller = new RawSourceController(rawSourceService);

  router.get("/", controller.list);
  router.get("/organization", controller.organization);
  router.post("/projects", validateBody(createSourceProjectSchema), controller.createProject);
  router.patch("/projects/:projectId", validateBody(renameSourceProjectSchema), controller.renameProject);
  router.delete("/projects/:projectId", controller.deleteProject);
  router.post(
    "/projects/:projectId/folders",
    validateBody(createSourceFolderSchema),
    controller.createFolder,
  );
  router.patch(
    "/projects/:projectId/folders/:folderId",
    validateBody(renameSourceFolderSchema),
    controller.renameFolder,
  );
  router.delete("/projects/:projectId/folders/:folderId", controller.deleteFolder);
  router.post("/", validateBody(createRawSourceSchema), controller.create);
  router.get("/:id", controller.get);
  router.patch("/:id/organization", validateBody(moveRawSourceSchema), controller.move);
  router.patch("/:id", validateBody(updateRawSourceSchema), controller.update);
  router.post("/:id/compile", controller.compile);
  router.delete("/:id", controller.delete);

  return router;
}
