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
              var message = "DATA: " + data +
                'data.body.items[0].track.artists[0].name: ' + data.body.items[0].track.artists[0].name +
                ' - data.body.items[0].track.name ' + data.body.items[0].track.name + '\n' +
                ' data.body.items[1].track.artists[0].name: ' + data.body.items[1].track.artists[0].name +
                ' - data.body.items[1].track.name: ' + data.body.items[1].track.name + '\n' +
                'data.body.items[2].track.artists[0].name: ' + data.body.items[2].track.artists[0].name +
                ' - data.body.items[2].track.name: ' + data.body.items[2].track.name;
              var tracks = '';
              for (var i=0; i < data.body.items.length: i++){
                tracks += data.body.items[i].track.artists[0].name;
              }

              return slack(res, tracks);
            }, function(err) {
              return slack(res, err.message);
            });
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
              }
            );
          }
        },
    function(err) {
      return slack(res, 'Could not refresh access token. You probably need to re-authorise yourself from your app\'s homepage.');
    }
  );
});

app.set('port', (process.env.PORT || 5000));
app.listen(app.get('port'));
