import type { NextFunction, Request, Response } from "express";
import type { TopicService } from "../services/topic.service.js";
import { requireStringParam } from "./requestParams.js";

export class TopicController {
  constructor(private readonly topicService: TopicService) {}

  list = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ topics: await this.topicService.listTopics() });
    } catch (error) {
      next(error);
    }
  };

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json({ topic: await this.topicService.createTopic(request.body) });
    } catch (error) {
      next(error);
    }
  };

  update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        topic: await this.topicService.updateTopic(requireStringParam(request, "id"), request.body),
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.topicService.deleteTopic(requireStringParam(request, "id"));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
