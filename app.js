var express       = require('express');
var bodyParser    = require('body-parser');
var request       = require('request');
var dotenv        = require('dotenv');
var SpotifyWebApi = require('spotify-web-api-node');

dotenv.load();

var spotifyApi = new SpotifyWebApi({
  clientId     : process.env.SPOTIFY_KEY,
  clientSecret : process.env.SPOTIFY_SECRET,
  redirectUri  : process.env.SPOTIFY_REDIRECT_URI
});

function slack(res, message) {
  if (process.env.SLACK_OUTGOING === 'true') {
    return res.send(JSON.stringify({text: message}));
  } else {
    return res.send(message);
  }
}

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', function(req, res) {
  if (spotifyApi.getAccessToken()) {
    return res.send('You are logged in.');
  }
  return res.send('<a href="/authorise">Authorise</a>');
});

app.get('/authorise', function(req, res) {
  var scopes = ['playlist-modify-public', 'playlist-modify-private'];
  var state  = new Date().getTime();
  var authoriseURL = spotifyApi.createAuthorizeURL(scopes, state);
  res.redirect(authoriseURL);
});

app.get('/callback', function(req, res) {
  spotifyApi.authorizationCodeGrant(req.query.code)
    .then(function(data) {
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      return res.redirect('/');
    }, function(err) {
      return res.send(err);
    });
});

app.use('/store', function(req, res, next) {
  if (req.body.token !== process.env.SLACK_TOKEN) {
    return slack(res.status(500), 'Cross site request forgerizzle!');
  }
  next();
});

app.post('/store', function(req, res) {
  spotifyApi.refreshAccessToken()
    .then(function(data) {
        spotifyApi.setAccessToken(data.body['access_token']);
        if (data.body['refresh_token']) {
          spotifyApi.setRefreshToken(data.body['refresh_token']);
        }
        if (req.body.text.trim().length === 0) {
            return res.send('Enter the name of the artist and the song, separated by a "-"\nExample: Eiffel 65 - Blue (Da Ba Dee)');
        }
        var text = process.env.SLACK_OUTGOING === 'true' ? req.body.text.replace(req.body.trigger_word, '') : req.body.text;
        if(text === 'help'){
            return slack (res,
              'Here\'s what I can help you with: \n' +
              '>`/djbot artist - song` - adds the song to playlist \n' +
            '>`/djbot help` - lists commands'
          )
        }
        else if(text === 'listtracks'){
          spotifyApi.getPlaylistTracks(process.env.SPOTIFY_USERNAME,  process.env.SPOTIFY_PLAYLIST_ID, { 'offset' : 1, 'limit' : 5, 'fields' : 'items' })
            .then(function(data) {
              var message = 'data.body.items.track.artists.name  ' + data.body.items.track.artists.name + 'data.body.items.track.name ' + data.body.items.track.name;
              return slack(res, message);
            }, function(err) {
              return slack(res, err.message);
            });

          // spotifyApi.getPlaylist(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PLAYLIST_ID)
          //   .then(function(data) {
          //     var message = 'Current tracks: ' + data.body;
          //     return slack (res, message);
          //   }, function(err) {
          //     return slack(res, err.message);
          //   });
        }
        else if(text.indexOf(' - ') === -1) {
          var query = 'track:' + text;
        }
        else {
          var pieces = text.split(' - ');
          var query = 'artist:' + pieces[0].trim() + ' track:' + pieces[1].trim();
          spotifyApi.searchTracks(query)
          .then(function(data) {
            var results = data.body.tracks.items;
            if (results.length === 0) {
              return slack(res, 'Could not find that track.');
            }
            var track = results[0];
            spotifyApi.addTracksToPlaylist(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PLAYLIST_ID, ['spotify:track:' + track.id],
            {
              position : -1
            })
            .then(function(data) {
              var message = {
                text: 'Track added' + (process.env.SLACK_OUTGOING === 'true' ? ' by *' + req.body.user_name + '*' : '') + ': *' + track.name + '* by *' + track.artists[0].name + '*',
                attachments: [{
                  image_url: track.album.images[1].url
                }]
              };
              return slack(res, message);
            }, function(err) {
              return slack(res, err.message);
            });
          },
          function(err) {
            return slack(res, err.message);
          });
        }
      },
    function(err) {
      return slack(res, 'Could not refresh access token. You probably need to re-authorise yourself from your app\'s homepage.');
    });
});

app.set('port', (process.env.PORT || 5000));
app.listen(app.get('port'));

// 
// {
//   "items":[
//     {
//       "added_at":"2017-05-25T00:11:34Z",
//       "added_by":{
//         "external_urls":{
//           "spotify":"http://open.spotify.com/user/cashmereeunice"
//         },
//         "href":"https://api.spotify.com/v1/users/cashmereeunice",
//         "id":"cashmereeunice","type":"user","uri":"spotify:user:cashmereeunice"
//       },
//       "is_local":false,
//       "track":{
//         "album":{
//           "album_type":"album",
//           "artists":[{
//             "external_urls":{
//               "spotify":"https://open.spotify.com/artist/1RyvyyTE3xzB2ZywiAwp0i"
//             },
//             "href":"https://api.spotify.com/v1/artists/1RyvyyTE3xzB2ZywiAwp0i",
//             "id":"1RyvyyTE3xzB2ZywiAwp0i",
//             "name":"Future",
//             "type":"artist",
//             "uri":"spotify:artist:1RyvyyTE3xzB2ZywiAwp0i"
//           }],
//           "available_markets":[
//             "AD","AR","AT","AU","BE","BG","BO","BR","CA","CH","CL","CO","CR","CY","CZ","DE","DK","DO","EC","EE","ES","FI","FR","GB","GR","GT","HK","HN","HU","ID","IE","IS","IT","JP","LI","LT","LU","LV","MC","MT","MX","MY","NI","NL","NO","NZ","PA","PE","PH","PL","PT","PY","SE","SG","SK","SV","TR","TW","US","UY"],
//             "external_urls":{
//               "spotify":"https://open.spotify.com/album/4YtTX4GPvBvewbJvBfXCS2"
//             },
//             "href":"https://api.spotify.com/v1/albums/4YtTX4GPvBvewbJvBfXCS2",
//             "id":"4YtTX4GPvBvewbJvBfXCS2",
//             "images":[{
//               "height":640,
//               "url":"https://i.scdn.co/image/31b0a579225a718b4b1aea0ac6f9e9bdd3da17b0",
//               "width":640
//             },
//             {
//               "height":300,
//               "url":"https://i.scdn.co/image/6b311ec6e3d6999a14e7d1ea8841d00226c292c6",
//               "width":300
//             },
//             {
//               "height":64,
//               "url":"https://i.scdn.co/image/5c132e86154f68bdf384cc165b07cb5dcb2ec5a3",
//               "width":64
//             }
//             ],
//             "name":"FUTURE",
//             "type":"album",
//             "uri":"spotify:album:4YtTX4GPvBvewbJvBfXCS2"
//           },
//           "artists":[{
//             "external_urls":{
//               "spotify":"https://open.spotify.com/artist/1RyvyyTE3xzB2ZywiAwp0i"
//             },
//             "href":"https://api.spotify.com/v1/artists/1RyvyyTE3xzB2ZywiAwp0i",
//             "id":"1RyvyyTE3xzB2ZywiAwp0i",
//             "name":"Future",
//             "type":"artist",
//             "uri":"spotify:artist:1RyvyyTE3xzB2ZywiAwp0i"
//           }],
//           "available_markets":["AD","AR","AT","AU","BE","BG","BO","BR","CA","CH","CL","CO","CR","CY","CZ","DE","DK","DO","EC","EE","ES","FI","FR","GB","GR","GT","HK","HN","HU","ID","IE","IS","IT","JP","LI","LT","LU","LV","MC","MT","MX","MY","NI","NL","NO","NZ","PA","PE","PH","PL","PT","PY","SE","SG","SK","SV","TR","TW","US","UY"],
//           "disc_number":1,
//           "duration_ms":204600,
//           "explicit":true,"external_ids":{
//             "isrc":"USSM11701444"
//           },
//           "external_urls":{
//             "spotify":"https://open.spotify.com/track/3rOSwuTsUlJp0Pu0MkN8r8"
//           },
//           "href":"https://api.spotify.com/v1/tracks/3rOSwuTsUlJp0Pu0MkN8r8",
//           "id":"3rOSwuTsUlJp0Pu0MkN8r8",
//           "name":"Mask Off",
//           "popularity":98,
//           "preview_url":"https://p.scdn.co/mp3-preview/0519fc7c44d418ca6c721d9aa83e9597065288e1?cid=955a1b3c419d445e859940767769c36f",
//           "track_number":7,
//           "type":"track",
//           "uri":"spotify:track:3rOSwuTsUlJp0Pu0MkN8r8"
//         }
//       }]
//   }
