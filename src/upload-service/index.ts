import express from "express";
import cors from "cors";
import path from "path"
import fs from "fs";

import {S3Client , PutObjectCommand} from "@aws-sdk/client-s3"
import {simpleGit , CleanOptions ,type SimpleGit } from "simple-git"
import { createClient } from "redis";
import { fetchProjectName , generate } from "../shared/utils.js";
import dotenv from "dotenv";
dotenv.config();

import { uploadFolderToS3 } from "../shared/utils.js";

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
        await redisClient.rPush("deploy-projects-queue" , s3FolderPrefix);
        await deleteFolder(path.dirname(outputFolderPath));

        console.log(`Added deployment ${id} to queue...`);
        return res.json({success: true , id: id});
    } catch (error) {
        console.log(error);
        return res.json({success: false , error : error});
    }
});


async function deleteFolder(dirPath: string) {
    console.log(dirPath);
    fs.rmSync(dirPath ,  {recursive: true});
    console.log("Project has been deleted.");
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