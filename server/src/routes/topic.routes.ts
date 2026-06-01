import { Router } from "express";
import { TopicController } from "../controllers/topic.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { TopicService } from "../services/topic.service.js";
import { createTopicSchema, updateTopicSchema } from "../validators/topic.schemas.js";

export function createTopicRoutes(topicService: TopicService) {
  const router = Router();
  const controller = new TopicController(topicService);

  router.get("/", controller.list);
  router.post("/", validateBody(createTopicSchema), controller.create);
  router.patch("/:id", validateBody(updateTopicSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
