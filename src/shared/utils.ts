import { s3Client } from "../shared/aws.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import mime from "mime-types"; 
import path from "path";

import dotenv from "dotenv";
dotenv.config();

export const generate = () => {
    const MAX_LENGTH = 7;
    const set = "0123456789abcdefghijklmnopqrstuvwxz";
    let id = "";
    for (let i = 0 ; i < MAX_LENGTH ; i++) {
        id += set[Math.floor(Math.random() * set.length)]
    }
    return id ;
}

export const fetchProjectName = (url: string) => {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const name: string = pathParts[pathParts.length - 1] ?? "";
    return name;
}


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

export async function uploadFolderToS3(dirPath: string , bucketName: string , s3FolderPrefix: string) {
    try {
        console.log("file path: ", dirPath);
        const files = getAllFiles(dirPath , []);
        console.log(files);
        console.log(`Project files ${files.length} will be uploaded...`);

        for (const filePath of files) {
            const relativePath = path.relative(dirPath , filePath);
            console.log("relative path: ", relativePath);
            
            const s3Key = path.join(s3FolderPrefix , relativePath).replace(/\\/g, "/");
            console.log("s3Key: ", s3Key);

            const fileBuffer = fs.readFileSync(filePath);
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
