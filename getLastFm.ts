import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { Client } from "https://deno.land/x/notion_sdk@v2.2.3/src/mod.ts";

config({export: true});
const notion = new Client({ auth: Deno.env.get("NOTION_API_SECRET") });

// ----- Get Data from Last.fm API -----
const params = {
  method: "user.getrecenttracks",
  limit: "5",
  user: Deno.env.get("LASTFM_USER_NAME") || "",
  api_key: Deno.env.get("LASTFM_API_KEY") || "",
  format: "json",
  extended: "1",
};

const resp = await fetch(
  "https://ws.audioscrobbler.com/2.0/?" + new URLSearchParams(params).toString()
);

let recentTracks;
if (resp.ok) {
  recentTracks = (await resp.json()).recenttracks.track;
  console.log(recentTracks);
  console.log(recentTracks[0].image);
  console.log(recentTracks[0].artist.image);
  console.log(recentTracks[0].url);

} else {
  console.error(`${resp.status} ${resp.statusText}`);
  Deno.exit(1);
}

// ----- Patch Data on Notion -----
const targetColumnListId = Deno.env.get("NOTION_COLUMN_LIST_ID")!;

const columnListResponse = await notion.blocks.children.list({
  block_id: targetColumnListId
});
const columns = columnListResponse.results;
if (columns.length < 2) {
  console.error("カラムの取得に失敗しました");
  Deno.exit(1);
}
// left column
const leftColumnId = columns[0].id;
const leftColumnResponse =  await notion.blocks.children.list({
  block_id: leftColumnId
});
// TODO: 画像ブロックの取得方法考える
const imageBlockId = leftColumnResponse.results[0].id;
await notion.blocks.update({
  block_id: imageBlockId,
  image: {
    external: {
      url: getImage(recentTracks[0]),
    }
  }
});

// right column
const rightColumnId = columns[1].id;
const rightColumnResponse =  await notion.blocks.children.list({
  block_id: rightColumnId
});
console.log(rightColumnResponse);
const titleBlockId = rightColumnResponse.results[0].id;
const describeBlockId = rightColumnResponse.results[1].id;
await notion.blocks.update({
  block_id: titleBlockId,
  paragraph: {
    rich_text: [{
      type: "text",
      text: {content: `${recentTracks[0].name} / ${recentTracks[0].artist.name}`},
    }],
  }
});

await notion.blocks.update({
  block_id: describeBlockId,
  paragraph: {
    rich_text: [{
      type: "text",
      text: {content: `${getDate(recentTracks[0].date).toLocaleString('ja-JP')}`},
    }],
    color: "gray",
  }
});


/**
 * Date型オブジェクトを取得する
 * データに時刻が存在しない場合再生中なので現在時刻を取得する
 * @param date Last.fmレスポンスのdateプロパティ
 * @returns Date
 */
function getDate(date: {uts: string} | undefined) {
  if (date === undefined) {
    return new Date();
  }
  return new Date(parseInt(date.uts));
}

/**
 * 表示する画像のURLを取得する
 * @param recentTrack Last.fmレスポンス
 * @returns URL文字列
 */
function getImage(recentTrack: any) {
  const defaultImage = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";
  // ジャケット画像を取得
  const albumImage = recentTrack.image.length >= 3 ? recentTrack.image[3]["#text"] : defaultImage;
  if (albumImage === defaultImage) {
    // アーティスト画像を取得
    const artistImage = recentTrack.artist.image.length >= 3 ? recentTrack.artist.image[3]["#text"] : defaultImage;
    return artistImage;
  }
  return albumImage;
}