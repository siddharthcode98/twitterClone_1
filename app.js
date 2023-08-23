const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/....");
    });
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();
//middleware authentication

const authorizationToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "mySecretCode", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 1 Registering
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectDbUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectDbUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const updateNewUserInDB = `INSERT INTO 
          user (name,username,password,gender)
          VALUES
          (
              '${name}',
              '${username}',
              '${hashPassword}',
              '${gender}'
          );`;
      await db.run(updateNewUserInDB);
      response.status(200);
      response.send("User created successfully");
    }
  }
});
///API 2 login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectDbUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectDbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "mySecretCode");
      //   console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//API 3
app.get("/user/tweets/feed/", authorizationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const userFollowingTweetsQuery = `SELECT DISTINCT username,tweet,date_time AS  dateTime
  FROM (user INNER JOIN tweet ON user.user_id=tweet.user_id) AS t1  
  INNER JOIN follower ON follower.following_user_id=t1.user_id 
  WHERE t1.user_id IN 
  (SELECT following_user_id FROM follower 
    WHERE follower_user_id=${getUserId.user_id})
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
  const getTweetsFromFollowings = await db.all(userFollowingTweetsQuery);
  response.send(getTweetsFromFollowings);
});
//API 4
app.get("/user/following/", authorizationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowingsOfUser = `SELECT DISTINCT name  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id WHERE user.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id});`;
  const listOfFollowingsNames = await db.all(getFollowingsOfUser);
  response.send(listOfFollowingsNames);
});
//API 5
app.get("/user/followers/", authorizationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowersOfUser = `SELECT DISTINCT name  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id WHERE user.user_id IN (SELECT follower_user_id FROM follower WHERE following_user_id=${getUserId.user_id});`;
  const listOfFollowersNames = await db.all(getFollowersOfUser);
  response.send(listOfFollowersNames);
});
//API 6
app.get("/tweets/:tweetId/", authorizationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const { tweetId } = request.params;
  const getUserIdFromTweet = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
  const getUser = await db.get(getUserIdFromTweet);
  const getFollowingsUserId = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
  const getFollowings = await db.all(getFollowingsUserId);
  let result = getFollowings.some(
    (each) => each.following_user_id === getUser.user_id
  );
  if (result) {
    const getTweetForUserQuery = `SELECT tweet AS tweet,
      (SELECT COUNT(like_id)FROM like WHERE tweet_id=${tweetId})AS likes,
      (SELECT COUNT(reply_id)FROM reply WHERE tweet_id=${tweetId})AS replies,
      date_time AS dateTime
      FROM tweet
      WHERE tweet_id=${tweetId};`;
    const getTweetForUser = await db.get(getTweetForUserQuery);
    response.send(getTweetForUser);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authorizationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const { tweetId } = request.params;
    const getUserIdFromTweet = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
    const getUser = await db.get(getUserIdFromTweet);
    const getFollowingsUserId = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
    const getFollowings = await db.all(getFollowingsUserId);
    let result = getFollowings.some(
      (each) => each.following_user_id === getUser.user_id
    );
    if (result) {
      const getNamesWhoLikedQuery = `SELECT * FROM like INNER JOIN user ON user.user_id=like.user_id WHERE tweet_id=${tweetId};`;
      const getNames = await db.all(getNamesWhoLikedQuery);
      const likes = getNames.map((each) => each.username);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
// API 8
app.get(
  "/tweets/:tweetId/replies/",
  authorizationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const { tweetId } = request.params;
    const getUserIdFromTweet = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
    const getUser = await db.get(getUserIdFromTweet);
    const getFollowingsUserId = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
    const getFollowings = await db.all(getFollowingsUserId);
    let result = getFollowings.some(
      (each) => each.following_user_id === getUser.user_id
    );
    if (result) {
      const getRepliesQuery = `SELECT user.name,reply.reply FROM reply INNER JOIN user ON reply.user_id=user.user_id WHERE tweet_id=${tweetId};`;
      const listOfReplies = await db.all(getRepliesQuery);
      const replies = listOfReplies.map((each) => {
        return {
          name: each.name,
          reply: each.reply,
        };
      });
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
//API 9
app.get("/user/tweets/", authorizationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const tweetsQuery = `
SELECT
tweet,
(
SELECT COUNT(like_id)
FROM like
WHERE tweet_id=tweet.tweet_id
) AS likes,
(
SELECT COUNT(reply_id)
FROM reply
WHERE tweet_id=tweet.tweet_id
) AS replies,
date_time AS dateTime
FROM tweet
WHERE user_id= ${getUserId.user_id}
`;
  const getAllTweetsOfUser = await db.all(tweetsQuery);
  response.send(getAllTweetsOfUser);
});
//API 10
app.post("/user/tweets/", authorizationToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const postATweetQuery = `INSERT INTO tweet(tweet,user_id) VALUES('${tweet}',${getUserId.user_id});`;
  const postATweet = await db.run(postATweetQuery);
  response.send("Created a Tweet");
});
//API 11
app.delete(
  "/tweets/:tweetId/",
  authorizationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId} AND user_id=${getUserId.user_id}`;
    const result = await db.run(deleteTweetQuery);
    if (result.changes !== 1) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
