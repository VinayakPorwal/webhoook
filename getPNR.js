 
const aws_chromium = require("@sparticuz/chromium");
const crawlee = require("crawlee");
const cheerio = require("cheerio");
const crypto = require("crypto");
const express = require("express");
const router = express.Router();
// const createLogger = require("../lokiConfig");

const getRequestQueue = async () => {
  const sessionId = crypto.randomUUID();
  return await crawlee.RequestQueue.open(sessionId);
};

// const logger = createLogger("aftership");

router.get('/pnr/:pnrNumber', async (req, res) => {
  const pnrNumber = req.params.pnrNumber;
  console.log("Starting tracking request...");

  let result;
  let requestsFailed = 0;

  const requestQueue = await getRequestQueue();

  const crawler = new crawlee.PlaywrightCrawler({
    navigationTimeoutSecs: 100000,
    requestQueue,
    launchContext: {
      launchOptions: {
        args: aws_chromium.args,
        executablePath: await aws_chromium.executablePath(),
        headless: true,
      },
    },
    async requestHandler({ page, request }) {
      try {
        // logger.info(`Processing: ${request.url}`);
        await page.goto(request.url, { waitUntil: "networkidle" });
        // Wait for PNR information to loa
        await page.waitForSelector("#passenger-info-container", { timeout: 60000 });

        // Get page content and load into cheerio
        const content = await page.$eval("#passenger-info-container", el => el.outerHTML);
        // console.log('HTML content:', content);
        const $ = cheerio.load(content);
        let detailsText = "";

        // Get train details
        const trainInfo = $(".train-info");
        if (trainInfo.length) {
          const trainNumber = trainInfo.find(".train-number").text().trim();
          const trainName = trainInfo.find(".train-name").text().trim();
          if (trainNumber && trainName) {
            detailsText += `Train: ${trainNumber} - ${trainName}\n`;
          }
        }

        // Get journey details
        const journeyInfo = $(".journey-info");
        if (journeyInfo.length) {
          const dateOfJourney = journeyInfo.find(".date").text().trim();
          const fromStation = journeyInfo.find(".source").text().trim();
          const toStation = journeyInfo.find(".destination").text().trim();
          if (dateOfJourney && fromStation && toStation) {
            detailsText += `Journey: ${fromStation} to ${toStation} on ${dateOfJourney}\n\n`;
          }
        }

        // Add passenger details
        detailsText += "Passenger Details:\n";
        $("#passenger-info-container tbody tr").each((index, row) => {
          detailsText += `Passenger ${index + 1}:\n`;
          detailsText += `Seat/Berth: ${$(row).find("td:nth-child(1) span").text().trim() || "N/A"}\n`;
          detailsText += `Current Status: ${$(row).find("td:nth-child(2) span:first-child").text().trim() || "N/A"}\n`;
          detailsText += `Prediction: ${$(row).find("td:nth-child(2) span:last-child").text().trim() || "N/A"}\n`;
          detailsText += `Booking Status: ${$(row).find("td:nth-child(3) span").text().trim() || "N/A"}\n`;
          detailsText += `Coach Position: ${$(row).find("td:nth-child(4) span").text().trim() || "N/A"}\n\n`;
        });

        const pnrDetails = detailsText.trim();

        if (!pnrDetails) {
          throw new Error("No PNR details found.");
        }

        result = {
          status: 200,
          data: pnrDetails,
        };
      } catch (error) {
        requestsFailed++;
      }
    },
    failedRequestHandler({ request, error }) {
      requestsFailed++;
    },
  });

  try {
    await crawler.run([
      `https://www.confirmtkt.com/pnr-status/${pnrNumber}`,
    ]);

    if (requestsFailed > 0 || !result) {
      res.status(403).json({
        status: "403",
        message: "Failed to retrieve tracking details.",
        requestsFailed,
      });
    }

    res.status(200).json({
      status: "200",
      message: "PNR details retrieved successfully",
      data: result,
    });
  } catch (error) {
    // logger.error(`Crawler run failed: ${error.message}`);
    res.status(500).json({
      status: "500",
      message: "Crawler execution failed",
      error: error.message,
    });
  }
});

 
module.exports = router;


// getPNRDetails("4525018046").then((pnrDetails) => {
//   console.log(pnrDetails);
// });
