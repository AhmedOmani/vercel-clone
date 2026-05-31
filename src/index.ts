import express from "express";
import cors from "cors";
import path from "path"
import fs from "fs";
import mime from "mime-types"; 
import {S3Client , PutObjectCommand} from "@aws-sdk/client-s3"
import {simpleGit , CleanOptions ,type SimpleGit } from "simple-git"
import { createClient } from "redis";
import { fetchProjectName , generate } from "./utils.js";

import dotenv from "dotenv";
dotenv.config();

const git : SimpleGit = simpleGit().clean(CleanOptions.FORCE);

const accessKeyId = process.env.accessKeyId;
const secretAccessKey = process.env.secretAccessKey;

if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS configuration credentials.");
}

const s3Client = new S3Client({
    region: "eu-north-1",
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    }
});

const redisClient = createClient();
redisClient.on("error" , (error) => console.error("Redis Client Error: " , error));

const PORT = 3000;

const app = express();

app.use(express.json());
app.use(cors());

app.post("/upload", async (req, res) => {
    const githubUrl = req.body.githubUrl;
    const id = generate();
    const projectName = fetchProjectName(githubUrl);
    const outputFolderPath = path.join(process.cwd() , "output" , id , projectName);

    try {
        await git.clone(githubUrl , outputFolderPath);
        console.log("Finished Cloninig...");

        const bucketName = "github-projects-cloned";
        const s3FolderPrefix = path.join(id , projectName);
        //S3 uploading
        await uploadFolderToS3(outputFolderPath, bucketName , s3FolderPrefix);
        //push to redis queue so deploy service fetch from there 
        await redisClient.rPush("deploy-projects-queue" , id);
        console.log(`Added deployment ${id} to queue...`);
        return res.json({success: true});
    } catch (error) {
        console.log(error);
        return res.json({success: false , error : error});
    }
});

function getAllFiles(dirPath: string , filesList: string[]) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== ".git" && file !== "node_modules")
                filesList = getAllFiles(filePath , filesList);
        } else {
            filesList.push(filePath)
        }
    })

    return filesList;
}

async function uploadFolderToS3(dirPath: string , bucketName: string , s3FolderPrefix: string) {
    try {
        const files = getAllFiles(dirPath , []);
        console.log(`Project files ${files.length} will be uploaded...`);

        for (const filePath of files) {
            const relativePath = path.relative(dirPath , filePath);
            const s3Key = path.join(s3FolderPrefix , relativePath).replace(/\\/g, "/");
            
            const fileBuffer = fs.readFileSync(filePath);
            console.log("Buffer: ");
            console.log(fileBuffer);
            const contentType = mime.lookup(filePath) || "application/octet-stream";

            const uploadParams = {
                Bucket: bucketName,
                Key: s3Key,
                Body: fileBuffer,
            }

            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log(`Successfully uploaded: ${s3Key}`);
        }

        console.log(`Successfully uploaded all project files.`);
    } catch (error) {
        console.error("Error occur while uploading to S3...\n", error);
    }
}

app.listen(PORT, async () => {
    try {
        await redisClient.connect();
        console.log("Redis server is up...");
        console.log(`Server is running on ${PORT}`);
    } catch(error) {
        console.log("Error while creating server...\n", error);
    }
});