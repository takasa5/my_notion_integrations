import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { DOMParser, Element, Text } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";
import { Client } from "https://deno.land/x/notion_sdk@v2.2.3/src/mod.ts";

config({export: true});
const baseUrl = "https://filmarks.com/users/tks5";
const notion = new Client({ auth: Deno.env.get("NOTION_API_SECRET") });
const databaseId = Deno.env.get("NOTION_MOVIE_DATABASE_ID") || "";

interface Movie {
  id: number;
  title: string;
  rating: string;
  review: string;
  thumbnail: string;
}

async function getFilmarksAllPages(baseUrl: string): Promise<Movie[]> {
  let page = 1;
  let allMovies: Movie[] = [];

  while (true) {
    const url = `${baseUrl}?page=${page}`;
    console.log(`Fetching page ${page}: ${url}`);

    try {
      const response = await fetch(url);
      const html = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      if (!doc) {
        console.error("Failed to parse HTML for page", page);
        break;
      }

      const movies: Movie[] = [];
      const movieElements = doc.querySelectorAll(".c-content-card");

      if (movieElements.length === 0) {
        console.log("No more movies found, exiting loop.");
        break;
      }

      for (const movieElement of movieElements) {
        const element = movieElement as Element;
        const titleElement = element.querySelector(".c-content-card__title a") as Element;
        let title = "";
        // テキストノードのみを結合（制作年を表現するspan要素を除外）
        if (titleElement) {
          for (const child of titleElement.childNodes) {
            if (child.nodeType === 3) {
              title += (child as Text).textContent;
            }
          }
          title = title.trim();
        }
        const rating = (element.querySelector(".c-rating__score") as Element)?.textContent?.trim() || "";
        const reviewElement = element.querySelector(".c-content-card__review") as Element;
        let review = reviewElement?.textContent || "";
        const readMoreLink = element.querySelector(".c-content-card__readmore-review a") as Element;

        if (readMoreLink) {
          const reviewUrl = readMoreLink.getAttribute("href");
          if (reviewUrl) {
            const fullReview = await fetchFullReview(reviewUrl);
            review = fullReview;
          }
        }
        const thumbnail = (element.querySelector(".c-content__jacket img") as Element)?.getAttribute("src") || "";

        movies.push({
          id: 0, // 一時的なダミーID
          title,
          rating,
          review,
          thumbnail,
        });
      }

      allMovies = allMovies.concat(movies);
      console.log(`Page ${page} fetched, ${movies.length} movies found.`);
      // DEBUG
      // break;
      page++;

    } catch (error) {
      console.error("Error fetching or parsing data:", error);
      break;
    }
  }

  console.log(`Total movies found: ${allMovies.length}`);
  // console.log(Deno.inspect(allMovies, { depth: Infinity, colors: true, strAbbreviateSize: Infinity }));
  // IDを振り直す
  const len = allMovies.length;
  for (let i = 0; i < len; i++) {
    allMovies[i].id = len - i;
  }
  return allMovies;
}

async function fetchFullReview(reviewUrl: string): Promise<string> {
  try {
    const response = await fetch(`https://filmarks.com${reviewUrl}`);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    if (!doc) {
      console.error("Failed to parse HTML for review URL", reviewUrl);
      return "";
    }
    const reviewElement = doc.querySelector(".p-mark-review") as Element;
    return reviewElement?.textContent?.trim() || "";
  } catch (error) {
    console.error("Error fetching full review:", error);
    return "";
  }
}

async function getAllSortIds(): Promise<number[]> {
  const sortIds: number[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    });

    response.results.forEach((page: any) => {
      if (page.properties.SortId && page.properties.SortId.number) {
        sortIds.push(page.properties.SortId.number);
      }
    });

    if (!response.has_more) {
      break;
    }

    if (response.next_cursor) {
      cursor = response.next_cursor;
    } else {
      break;
    }
  }

  return sortIds;
}

async function createNotionPage(movie: Movie, sortIds: number[]) {
  if (sortIds.includes(movie.id)) {
    console.log(`Page with SortId ${movie.id} already exists. Skipping.`);
    return;
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: movie.title,
              },
            },
          ],
        },
        Rating: {
          number: parseFloat(movie.rating),
        },
        SortId: {
          number: movie.id,
        },
        Thumbnail: {
          files: [
            {
              name: movie.title,
              external: {
                url: movie.thumbnail,
              },
            },
          ],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: movie.review,
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: []
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "from "
                }
              },
              {
                type: "text",
                text: {
                  content: "Filmarks",
                  link: {
                    url: "https://filmarks.com/users/tks5"
                  },
                },
              },
            ]
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "by "
                }
              },
              {
                type: "text",
                text: {
                  content: "my_notion_integrations",
                  link: {
                    url: "https://github.com/takasa5/my_notion_integrations"
                  },
                },
              },
            ]
          }
        },
      ],
    });
    console.log("Success! Page added:", response.id);
  } catch (error: any) {
    console.error("Error adding page:", error.body);
  }
}

const movies = await getFilmarksAllPages(baseUrl);
const sortIds = await getAllSortIds();
movies.forEach(async (movie) => {
  await createNotionPage(movie, sortIds);
});
