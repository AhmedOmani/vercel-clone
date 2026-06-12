import express from "express";
import {S3Client , GetObjectCommand} from "@aws-sdk/client-s3";
import mime from "mime-types";
import {Readable} from "stream";
import { s3Client } from "../shared/aws.js";

const BUCKET_NAME = "github-projects-cloned"
const PORT = 3000;

const app = express();

app.use(async (req , res) => {
    const hostname = req.hostname;
    const id = hostname.split(".")[0];
    const projectName = hostname.split(".")[1];
    console.log("project name:" , projectName);

    let filePath = req.path === "/" ? "index.html" : req.path;

    if (filePath.startsWith("/")) {
        filePath = filePath.substring(1);
    }

    const s3Key = `deploy/${id}/${projectName}/${filePath}`.replace(/\\/g , "/");
    console.log("Key:" , s3Key);

    console.log(`[Proxy Request]: Subdomain ID: ${id} -> Fetching S3 Key: ${s3Key}`);

    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key
        });
        const response = await s3Client.send(command);
        
        const contentType = mime.lookup(filePath) || "application/octet-stream";
        res.setHeader("Content-Type" , contentType);

        if (response.Body) {
            (response.Body as Readable).pipe(res);
        }
    } catch (error) {
        console.error(`Asset not found for key: ${s3Key}`, error);
        res.status(404).json({
            message: "Error occured while uploading the project.",
            error: error
        });
    }
});


app.listen(PORT, () => {
    console.log(`Request Handler Proxy Layer is running on port ${PORT}`);
});