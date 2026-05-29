import { Router } from "express";
import { RawSourceController } from "../controllers/rawSource.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { RawSourceService } from "../services/rawSource.service.js";
import { createRawSourceSchema, updateRawSourceSchema } from "../validators/rawSource.schemas.js";

export function createRawSourceRoutes(rawSourceService: RawSourceService) {
  const router = Router();
  const controller = new RawSourceController(rawSourceService);

  router.get("/", controller.list);
  router.post("/", validateBody(createRawSourceSchema), controller.create);
  router.get("/:id", controller.get);
  router.patch("/:id", validateBody(updateRawSourceSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
