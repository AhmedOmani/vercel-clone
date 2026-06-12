
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;

if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS configuration credentials.");
}

export const s3Client = new S3Client({
    region: "eu-north-1",
    credentials: { accessKeyId, secretAccessKey }
});