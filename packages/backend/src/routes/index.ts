import { Router } from "express";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { puppyRouter } from "./puppy";
import { eventsRouter } from "./events";
import { predictionsRouter } from "./predictions";
import { modelsRouter } from "./models";
import { pushRouter } from "./push";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(puppyRouter);
apiRouter.use(eventsRouter);
apiRouter.use(predictionsRouter);
apiRouter.use(modelsRouter);
apiRouter.use(pushRouter);
