import express from "express"; import cors from "cors";
import { smsWebhook } from "../sms/gateway";
export const app = express();
app.use(cors()); app.use(express.json());
app.post("/webhook/sms", smsWebhook);
app.get("/health", (_,res)=>res.send("ok"));

