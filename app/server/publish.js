// Publish the current user

Meteor.publish('currentUser', function() {
  var user = Meteor.users.find({_id: this.userId});
  return user;
});


// Publish chat rooms

Meteor.publish('chatRooms', function () {
  if (!this.userId) {
    this.ready();
    return;
  }
  var user = Meteor.users.findOne({_id: this.userId});
  var userServersCursor = UserServers.find(
    {user_id: this.userId, active: true},
    {created: 0, last_updated: 0}
  );
  var userChannelsCursor = UserChannels.find(
    {user_id: this.userId, active: true, server_active: true},
    {last_updated: 0, created: 0}
  );
  var userPmsCursor = UserPms.find(
    {user_id: this.userId}
  );
  Meteor.setTimeout(function () {
    userServersCursor.forEach(function (fields) {
      if (fields.status != 'connected')
        return;
      var roomSignature = fields.user + '||' + fields.name;
      UnreadLogsCount.upsert({
        room_signature: roomSignature,
        user: user.username
      }, {
        $set: {
          last_updated_at: new Date(),
          offset: chatRoomLogCount.getCurrentLogCountForInterval(roomSignature)
        }
      });
    });
    userChannelsCursor.forEach(function (fields) {
      if (fields.status != 'connected')
        return;
      var roomSignature = fields.user_server_name + '::' + fields.name;
      UnreadLogsCount.upsert({
        room_signature: roomSignature,
        user: user.username
      }, {
        $set: {
          last_updated_at: new Date(),
          offset: chatRoomLogCount.getCurrentLogCountForInterval(roomSignature)
        }
      });
    });
    userPmsCursor.forEach(function (fields) {
      var roomSignature = fields.user + '||' + fields.user_server_name +
        '::' + fields.name;
      UnreadLogsCount.upsert({
        room_signature: roomSignature,
        user: user.username
      }, {
        $set: {
          last_updated_at: new Date(),
          offset: chatRoomLogCount.getCurrentLogCountForInterval(roomSignature)
        }
      });
    });
  }, 100);
  return [
    Servers.find(),
    userServersCursor,
    userChannelsCursor,
    userPmsCursor
  ];
});

Meteor.publish('servers', function () {
  if (this.userId)
    return Servers.find();
  this.ready();
});

Meteor.publish('user_servers', function () {
  if (this.userId)
    return user_servers = UserServers.find(
      {user_id: this.userId, active: true},
      {created: 0, last_updated: 0});
  this.ready();
});

Meteor.publish('user_server_logs', function (
    user_server_name, from, direction, limit) {
  if (this.userId) {
    var user = Meteor.users.findOne({_id: this.userId});
    var server = UserServers.findOne({
      name: user_server_name, user: user.username});
    var query = {};
    if (server) {
      query.filter = {
        server_name: server.name,
        user: user.username
      };
      query = updateChatlogsQuery(query, from, direction, limit);
      console.log(query.filter, query.extraOptions);
      var cursor = UserServerLogs.find(
        query.filter,
        query.extraOptions
      );
      return cursor;
    }
  }
  this.ready();
});

Meteor.publish('user_channels', function () {
  if (this.userId) {
    var user = Meteor.users.findOne({_id: this.userId});
    var user_channels = UserChannels.find(
      {user: user.username, active: true},
      {last_updated: 0, created: 0});
    var u = [];
    user_channels.forEach(function (channel) {
      u.push(channel.name);
    });
    console.log('Publishing channels for user: ' + this.userId);
    return user_channels;
  }
  this.ready();
});

function updateChatlogsQuery (query, from, direction, limit) {
  var sortOrder = {created: -1};
  if (from) {
    try {
      from = moment(from).toDate();
      if (direction == 'down') {
        query.filter['created'] = {$gte: from};
        sortOrder = {created: 1};
      } else if (direction == 'up') {
        query.filter['created'] = {$lte: from};
      }
    } catch (err) {}
  }
  if (limit) {
    try {
      limit = parseInt(limit);
      limit = typeof(limit) == 'number'? (
        limit > DEFAULT_LOGS_COUNT?
          DEFAULT_LOGS_COUNT: limit): DEFAULT_LOGS_COUNT;
    } catch (err) {
      limit = DEFAULT_LOGS_COUNT;
    }
  }
  query.extraOptions = {
    limit: limit,
    sort: sortOrder
  };
  return query;
}

Meteor.publish('channel_logs', function (
    server_name, channel_name, from, direction, limit) {
  var user = Meteor.users.findOne({_id: this.userId}) || {};
  console.log(user);
  var channel = UserChannels.findOne({
    name: channel_name, user: user.username, user_server_name: server_name});
  console.log('CHANNEL');
  console.log(channel);
  var query = {};
  if (channel) {
    query.filter = {
      channel_name: channel.name,
      server_name: channel.user_server_name,
      $or: [
        {global: true, not_for_user: {$ne: user.username}},
        {from_user: user.username},
        {user: user.username}
      ]
    };
    query = updateChatlogsQuery(query, from, direction, limit);
    console.log(
      'Publishing logs for channel: ' + channel.name + ', ' + user.username);
    console.log(query.filter, query.extraOptions);
    var cursor = ChannelLogs.find(
      query.filter,
      query.extraOptions
    );
    return cursor;
  }
  this.ready();
});

Meteor.publish(
  'pm_logs', function (room_id, from, direction, limit) {
    var user = Meteor.users.findOne({_id: this.userId});
    if (room_id && user) {
      console.log('publishing PMLogs');
      var nick = room_id.slice(room_id.search('_') + 1);
      var query = {
        filter: {
          $or: [
            {from: nick},
            {to_nick: nick}
          ], user: user.username
        }
      };
      query = updateChatlogsQuery(query, from, direction, limit);
      console.log(query.filter, query.extraOptions);
      var cursor = PMLogs.find(query.filter, query.extraOptions);
      return cursor;
    }
    this.ready();
});

Meteor.publish('user_pms', function () {
  return UserPms.find({user_id: this.userId});
});
/*
Meteor.publish('server_nicks', function () {
  var user = Meteor.users.findOne({_id: this.userId});
  if (!user)
    return;
  var server_ids = [];
  UserServers.find({user: user.username}, {_id: 1}).forEach(function (value) {
    server_ids.push(value.server_id);
  });
  console.log('publishing server nicks');
  return ServerNicks.find({server_id: {
    $in: server_ids}}, {last_updated: 0, created: 0});
});
*/

Meteor.publish('server_nicks', function (server_name, nicks) {
  if (server_name && nicks)
    return ServerNicks.find(
      {server_name: server_name, nick: {$in: nicks}},
      {fields: {created: 0, last_updated: 0}}
    );
  this.ready();
})

Meteor.publish('channel_nicks', function (server_name, channel_name, from, to) {
  var user = Meteor.users.findOne({_id: this.userId});
  if (!user) {
    this.ready();
    return;
  }
  var query_or = [];
  if (server_name && channel_name) {
    var query = {server_name: server_name, channel_name: channel_name};
    var start_nick = ChannelNicks.findOne(
      {channel_name: channel_name, server_name: server_name},
      {sort: {nick: 1}});
    var last_nick = ChannelNicks.findOne(
      {channel_name: channel_name, server_name: server_name},
      {sort: {nick: -1}});
    if (to && start_nick && start_nick.nick == to) {
      from = to;
      to = null;
    } else if (from && last_nick && last_nick.nick == from) {
      to = from;
      from = null;
    }
    var sort_dict = {nick: 1};
    if (to) {
      query['nick'] = {$lte: to};
      sort_dict = {nick: -1};
    }
    else if (from) {
      query['nick'] = {$gte: from};
    }
    return ChannelNicks.find(
      query,
      {fields: {created: 0, last_updated: 0}, limit: 40, sort: sort_dict});
  } else {
    UserServers.find({user_id: user._id}).forEach(function (user_server) {
      var channel_names = [];
      var query_dict = {
        server_name: user_server.name, channel_name: {$in: channel_names}};
      UserChannels.find({
          user_server_id: user_server._id, active: true
        }).forEach(function (user_channel) {
          channel_names.push(user_channel.name);
        });
      query_or.push(query_dict);
      console.log(query_dict.channel_name);
    });
    if (query_or.length > 0)
      return ChannelNicks.find({$or: query_or},
        {fields: {created: 0, last_updated: 0}});
  }
  this.ready();
});

Meteor.publish('bookmarks', function () {
  if (this.userId) {
    var bookmarks = Bookmarks.find({userId: this.userId});
    return bookmarks;
  }
  this.ready();
});

Meteor.publish('channel_nick_suggestions',
  function (server_name, channel_name, pattern, limit) {
    var _this = this;
    ChannelNicks.find(
      {
        server_name: server_name,
        channel_name: channel_name,
        nick: {$regex: '^' + pattern + '.+', $options: 'i'},
      },
      {
        fields: {last_upated: 0, created: 0},
        limit: limit || 10
      }
    ).forEach(function (channel_nick) {
      console.log('channel_nick_suggestions_added');
      console.log(channel_nick);
      _this.added('channel_nick_suggestions', channel_nick._id, channel_nick);
    });
    _this.ready();
  });

Meteor.methods({
  say: function(message, id, roomtype) {
    var user = Meteor.users.findOne({_id: this.userId});
    if (roomtype == 'channel') {
      var channel = Channels.findOne({_id: id});
      var server = channel.server_name;
      var to = channel.name;
    } else if (roomtype == 'pm') {
      var to = id.substr(id.indexOf('-') + 1);
      var server_id = id.split('-', 1)[0];
      var server = Servers.findOne({_id: server_id}).name;
    } else return;
    var client = Clients[user.username][server];
    client.say(to, message);
  },
  join: function (channel_name, server_id) {
    var user = Meteor.users.findOne({_id: this.userId});
    var server = Servers.findOne({_id: server_id});
    var channel = Channels.findOne({server_id: server_id, name: channel_name});
    if (!channel) {
      Channels.insert(
        {name: channel_name, server_id: server_id, server_name: server.name});
    }
    //console.log(server_id);
    //console.log(Clients);
    var client = Clients[us44er.username][server.name];
    client.join(channel_name, function () {
      //console.log('Joined channel: ' + channel_name);
    });
  }
});


Meteor.publish('latest_channel_log', function (serverName, channelName) {
  var channel = UserChannels.findOne({
    user_server_name: serverName, name: channelName,
    user_id: this.userId
  });
  if (!channel) {
    this.ready();
    return;
  }
  return ChannelLogs.find(
    {
      channel_name: channelName, server_name: serverName, global: true
    },
    {sort: {created: -1}, limit: 1}
  );
});


Meteor.publish('latest_server_log', function (serverName) {
  if (!this.userId) {
    this.ready();
    return;
  }
  var userServer = UserServers.findOne({
    name: serverName,
    user_id: this.userId
  });
  if (!userServer) {
    this.ready();
    return;
  }
  return UserServerLogs.find({
    server_name: serverName,
    user_id: this.userId
  }, {sort: {created: -1}, limit: 1});
});

Meteor.publish('latest_pm_log', function (serverName, nick) {
  console.log('latest_pm_log', serverName, nick);
  if (!this.userId) {
    this.ready();
    return;
  }
  var userServer = UserServers.findOne({
    name: serverName,
    user_id: this.userId
  });
  if (!userServer) {
    this.ready();
    return;
  }
  return PMLogs.find({
    $or: [
      {from: nick},
      {to_nick: nick}
    ], user_id: this.userId
  }, {sort: {created: -1}, limit: 1});
});
