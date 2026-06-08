import {S3Client , ListObjectsV2Command, GetObjectCommand} from "@aws-sdk/client-s3";
import {createClient} from "redis";

import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { Readable } from "stream";
import { spawn } from "child_process";

import { uploadFolderToS3 } from "../shared/utils.js";

dotenv.config();

const redisClient = createClient();

const downloadS3Folder = async  (s3Client: S3Client, bucketName: string , s3Prefix: string , targetDir: string) => {
    const listCommand = new ListObjectsV2Command({
        Bucket: bucketName, 
        Prefix: s3Prefix
    });

    const listedObjects = await s3Client.send(listCommand);

    if (!listedObjects.Contents) 
        return;
    
    for (const object of listedObjects.Contents) {
        if (!object.Key) continue;
        
        const fullPath = path.join(targetDir , object.Key);
        fs.mkdirSync(path.dirname(fullPath) , { recursive: true });

        const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: object.Key
        });

        const response = await s3Client.send(getCommand);

        if (!response.Body) continue;

        const writeStream = fs.createWriteStream(fullPath);
        await Readable.from(response.Body as any).pipe(writeStream);
        
        console.log(`Downloaded: ${fullPath}`);

    }
};

const buildProject = async (command: string , args: string[] , projectPath: string) : Promise<void> => {
    return new Promise((resolve, reject) => {
        const child = spawn(command , args , {
            cwd: projectPath,
            shell: true
        });

        child.stdout.on("data" , (data: any) => {
            console.log(`[LOG]: ${data.toString().trim()}`);
        });

        child.stderr.on("data" , (data) => {
            console.error(`[ERR]: ${data.toString().trim()}`)
        });

        child.on("close" , (code) => {
            if (code === 0) {
                console.log(`Command '${command} ${args.join(" ")} executed successfully.`);
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}.`));
            }
        });

        child.on("error" , (err) => {
            reject(err);
        });
    })
}
//npm run start:deploy

const deploy = async (s3Client: S3Client, bucketName: string, targetDir: string) => {
    while(true) {
        
        const job = await redisClient.blPop("deploy-projects-queue" , 0);
        const s3Prefix = job?.element ?? "";
        const fullPath = path.join(targetDir , s3Prefix);
        console.log("full path: " , fullPath);

        try {    
            console.log("Starting downloading the project from object storage...");
            await downloadS3Folder(s3Client, bucketName , s3Prefix , targetDir);
    
            console.log("Starting dependency installation...");
            await buildProject("npm" , ["install"] , fullPath);
            
            console.log("Starting production build generation...");
            await buildProject("npm" , ["run" , "build"] , fullPath);

            console.log(`Deployment ${s3Prefix} built successfully , Ready for distribution`);
            await uploadFolderToS3(`${fullPath}/dist`, bucketName , `deploy/${s3Prefix}`);

        } catch(error) {
            console.error(`Deployment ${s3Prefix} failed at build stage: \n`, error);
        }
    }
}

const go = async () => {
    //connect to redis
    await redisClient.connect();

    //connect to s3
    const accessKeyId = process.env.accessKeyId;
    const secretAccessKey = process.env.secretAccessKey;
    if (!accessKeyId || !secretAccessKey) {
        throw new Error("AWS Configurations Missed!");
    }
    const s3Client = new S3Client({
        region: "eu-north-1",
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey
        }
    });
    const bucketName = "github-projects-cloned";
    const targetDir = path.join(process.cwd() , "downloaded");

    // start the worker
    deploy(s3Client, bucketName, targetDir);
} 

go();