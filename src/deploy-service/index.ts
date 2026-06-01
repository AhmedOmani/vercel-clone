import {createClient} from "redis";

const redisClient = createClient();

const deploy = async () => {
    await redisClient.connect();
    while(true) {
        const job = await redisClient.brPop("deploy-projects-queue" , 0);
        console.log("job: " , job?.element) ;

        //Start deploying logic
    }
}

deploy();