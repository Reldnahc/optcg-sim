import { clientOnlyValue } from "../../../client/src/example";
import React from "react";
import Redis from "redis";
import { Client as PgClient } from "pg";
import WebSocket from "ws";
import axios from "axios";
import { fetch as undiciFetch } from "undici";

export const forbiddenReference = clientOnlyValue;
export const forbiddenReact = React;
export const forbiddenRedis = Redis;
export const forbiddenPgClient = PgClient;
export const forbiddenWebSocket = WebSocket;
export const forbiddenAxios = axios;
export const forbiddenUndiciFetch = undiciFetch;
