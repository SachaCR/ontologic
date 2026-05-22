import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function start() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  const port = process.env.PORT ?? "3394";
  await app.listen(port);
}

void start();
