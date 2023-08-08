import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
// import { LambdaDataSource } from 'aws-cdk-lib/aws-appsync';
// import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';


// !! where we will write AWS resources !!

export class ToDoInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // !!! EVERY TASK WE ADD TO THE TABLE MUST HAVE: task_id, user_id, created_time

    // Create DDB table called "Tasks" to store the tasks
    // partitionKey: index column of table called "task_id"; elements are strings
    // billingMode: ddb has 2 billing modes: pay per request (pay as needed) OR provision based (reserve a certain read/write capacity)
    // timeToLiveAttribute: another column for items; ddb expects this to be a UNIX timestamp: 
        // date when this item will be deleted from the table (24 hours after added...for testing purposes) TAKE OUT LATER !!!
    const table = new ddb.Table(this, "Tasks", {
      partitionKey: {name: "task_id", type: ddb.AttributeType.STRING}, 
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "tt1",
    });

    // Add Global Secondary Index (GSI) based on user_id
    // GSI: think in terms of SQL: join Tasks and GSI table
        // HOWEVER: DDB does not have separate tables...this is one big table -> 
        // SO: we tell DDB that we want to use this column as a second index
        // DDB pre-indexes this so our queries are faster
        // good for scaling!!!
    // sort items by created_time (most recently to least recently)
    table.addGlobalSecondaryIndex({
      indexName: "user-index",
      partitionKey: {name: "user_id", type: ddb.AttributeType.STRING},
      sortKey: {name: "created_time", type: ddb.AttributeType.NUMBER},
    });

    // Create Lambda function for the API
      // "this": the parent scope of this resource: cdk.Stack
      // "API": local identifier of this function (does not need to be globally unique)
      // code: where the local function code lives: "../api" means cd .. -> cd api
          // this uploads the whole api folder to AWS lambda
      // handler: tells lambda which function to run: "to-do.handler" means: the handler function from to-do file
      // environment: global variables that we pass to lambda that it will have access to
          // we need this because lambda needs to know which tables it needs to edit
          // "table.tableName" references the table from above

    // !! LAMBDA FUNCTION HANDLES ALL API CALLS: create new task, edit task, delete task, etc !!
    const api = new lambda.Function(this, "API", {
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset("../api"),
      handler: "to-do.handler",
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    // !!! WE NEED A PUBLIC ENDPOINT (through lambda) IF WE WANT OTHER PEOPLE TO BE ABLE TO ACCESS
    
    // Create a URL so we can access the function
      // reference the lambda object from above
      // no authentication needed for this lightweight API
      // cors: cross-origin resource sharing
          // if configured incorrectly, certain browsers will not be able to access this API (we need to test locally)
    const functionURL = api.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ["*"],
      },
    });

    // Output the API function url
        // clicking that url will allow us to use the lambda function remotely
    new cdk.CfnOutput(this, "APIUrl", {
      value: functionURL.url,
    });

    // !!! BY DEFAULT, THINGS CREATED ON THE SAME ACCOUNT/STACK DO NOT HAVE PERMISSION TO ACCESS EACH OTHER
    // --> THE LAMBDA FUNCTION CANNOT READ/WRITE FROM THE DDB TABLE 

    // Give lambda function permissions to read/write to the table
    table.grantReadWriteData(api);

    
  }
}
