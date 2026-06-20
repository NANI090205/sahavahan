const axios = require("axios");
const BASE_URL = "http://localhost:4040";

async function measureConcurrency(concurrencyLevel) {
  console.log(`\nSimulating load of ${concurrencyLevel} concurrent users hitting GET /api/rides/all...`);

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < concurrencyLevel; i++) {
    promises.push(axios.get(`${BASE_URL}/api/rides/all`).catch(err => err));
  }

  const results = await Promise.all(promises);
  const endTime = Date.now();

  const totalTime = endTime - startTime;
  const averageLatency = (totalTime / concurrencyLevel).toFixed(2);

  let successCount = 0;
  let failureCount = 0;

  for (const res of results) {
    if (res.status === 200) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  console.log(`- Concurrency Level: ${concurrencyLevel} users`);
  console.log(`- Success rate: ${((successCount / concurrencyLevel) * 100).toFixed(1)}% (${successCount} successful, ${failureCount} failed)`);
  console.log(`- Total execution time: ${totalTime}ms`);
  console.log(`- Average request latency: ${averageLatency}ms`);
}

async function main() {
  console.log("==================================================");
  console.log("            SAHAVAHAN LOAD TESTING");
  console.log("==================================================");

  // Measure baseline memory
  const memUsageBefore = process.memoryUsage();
  console.log(`Baseline Memory Usage: RSS=${(memUsageBefore.rss / 1024 / 1024).toFixed(2)}MB, HeapUsed=${(memUsageBefore.heapUsed / 1024 / 1024).toFixed(2)}MB`);

  await measureConcurrency(10);
  await measureConcurrency(50);
  await measureConcurrency(100);
  await measureConcurrency(500);
  await measureConcurrency(1000);

  const memUsageAfter = process.memoryUsage();
  console.log(`\nMemory Usage after load tests: RSS=${(memUsageAfter.rss / 1024 / 1024).toFixed(2)}MB, HeapUsed=${(memUsageAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  
  console.log("\n==================================================");
  console.log("🎉 LOAD TESTING COMPLETED!");
  console.log("==================================================");
}

main().catch(console.error);
