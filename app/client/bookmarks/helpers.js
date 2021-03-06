waartaa.bookmarks.helpers = {
  getBookmarkedItems: function (bookmarkId, page) {
    var bookmark = Bookmarks.findOne({_id: bookmarkId});
    var channel_name = bookmark.roomInfo.channel_name;
    var server_name = bookmark.roomInfo.server_name;
    var logTimestamp = bookmark.logTimestamp;

    var API_URL = waartaa.bookmarks.API_ENDPOINT;
    Meteor.http.post(API_URL, {
      data: {
        logTimestamp: logTimestamp,
        channel_name: channel_name,
        server_name: server_name,
        page: page
      }
    }, function (err, resp) {
      if (!err) {
        waartaa.search.helpers.renderResponse(resp, 'bookmark');
      } else {
        alert('OOPS! An error occured while fetching data');
      }
    });
  },
};
