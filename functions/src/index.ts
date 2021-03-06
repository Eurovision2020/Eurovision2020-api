import * as express from 'express'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as cors from 'cors'


admin.initializeApp(functions.config().firebase)

const db = admin.firestore()
const app = express();
const main = express();

main.use('/v1', app);

// Automatically allow cross-origin requests
app.use(cors({ origin: true }));

export const api = functions.https.onRequest(main);

const songsRoute = functions.https.onRequest((request, response) => {

    const fetchCountries = db.collection('countries').get().then((snapshot) => {
        const countries: any[] = []
        snapshot.forEach((doc) => {
            const country = {
                code: doc.id,
                name: doc.data().name,
                flag: doc.data().flag
            }
            countries.push(country)
        })
        return countries
    })

    const fetchSongs = db.collection('songs').get()

    Promise.all([fetchCountries, fetchSongs]).then((result) => {
        const countries = result[0]
        const songsSnapshot = result[1]
        const songsArray: any[] = []
        songsSnapshot.forEach((doc) => {
            const matchingCountry = countries.find(c => {
                return c.code === doc.data().countryCode
            })
            const song = {
                number: doc.data().number,
                title: doc.data().title,
                link: doc.data().link,
                image_original: `https://firebasestorage.googleapis.com/v0/b/eurovision2020-ea486.appspot.com/o/${matchingCountry.code}.jpg?alt=media`,
                image: `https://firebasestorage.googleapis.com/v0/b/eurovision2020-ea486.appspot.com/o/${matchingCountry.code}_600x600.jpg?alt=media`,
                image_flag: `https://firebasestorage.googleapis.com/v0/b/eurovision2020-ea486.appspot.com/o/flags%2F${matchingCountry.code}_600x600.png?alt=media`,
                country: matchingCountry
            }
            songsArray.push(song)

            songsArray.sort((a, b) => (a.number > b.number) ? 1 : -1)
        })
        response.send(songsArray)
    }).catch((err) => {
        console.log('Error getting song', err)
    })

})

// Api
app.get('/songs', songsRoute)


app.post('/vote', (request, response) => {
    response.status(404).send("Voting ended on May 20th at 00:00")

    // const votesBody = request.body.votes
    // const authToken = request.headers.authorization

    // if (authToken === undefined) {
    //     response.status(401).send("You must authenticate with a valid token")
    //     return
    // }

    // console.log(`votesBody ${votesBody}`)
    // if (votesBody === undefined) {
    //     console.log(`NO votes body in request : ${request}, body: ${request.body}`)
    //     response.status(400).send("You must provide a body with votes")
    //     return
    // }

    // console.log(`votesBody.length ${votesBody.length}`)
    // if (votesBody.length > 20) {
    //     response.status(400).send("Votes should have a maximum of 20 entries")
    //     return
    // }

    // console.log(`verifying token: ${authToken}`)
    // admin.auth().verifyIdToken(authToken).then(function (decodedToken) {
    //     let phoneNumber = decodedToken.phone_number
    //     let countryCode = countryCodeFromPhoneNumber(phoneNumber)
    //     let userId = decodedToken.uid

    //     console.log(`Voting from phoneNumber: ${phoneNumber},  countryCode: ${countryCode}, userId ${userId}`)
    //     let vote = {
    //         user: userId,
    //         country: countryCode,
    //         votes: votesBody
    //     }

    //     // Add a new document in collection "cities" with ID 'LA'
    //     db.collection('votes').doc(userId).set(vote).then((result) => {
    //         console.log(`Succes saving vote`)
    //         response.send(vote)
    //     }).catch(function (error) {
    //         console.log(`Error saving vote : ${error}`)
    //         response.send("Error Saving vote")
    //     })

    // }).catch(function (error) {
    //     console.log(`Error decoding token : ${error}`)
    //     response.status(403).send(`Error decoding token ${error}`)
    // });
})

app.get('/vote', (request, response) => {
    let authToken = request.headers.authorization
    if (authToken === undefined) {
        response.status(401).send("You must authenticate with a valid token")
    }
    admin.auth().verifyIdToken(authToken!).then(function (decodedToken) {
        let userId = decodedToken.uid
        db.collection('votes').doc(userId).get().then((doc) => {
            if (doc.exists) {
                response.send(doc.data())
            } else {
                response.status(404).send("You haven't voted yet")
            }
        }).catch(function (error) {
            response.send("Error Getting yout vote")
        })
    }).catch(function (error) {
        response.status(403).send("Error decoding token")
    });
})

app.get('/processCountryVotes', (request, response) => {
    db.collection("countries").get().then((countriesDoc) => {
        const votePromises: any[] = []
        countriesDoc.forEach((countryDoc) => {
            type myMap = { [key: string]: any }
            let documentToWrite: myMap = {}
            const votePromise = db.collection('votes').where('country', '==', countryDoc.id).get().then((votesDoc) => {
                const countryVotePromises: any[] = [];
                documentToWrite["totalVotes"] = votesDoc.size
                let votes: myMap = {}
                countriesDoc.forEach((countryDoc2) => {
                    let countryCode = countryDoc2.id
                    votes[countryCode] = 0
                    votesDoc.forEach((voteDoc) => {
                        let arrayOfVotes: [string] = voteDoc.data().votes
                        let countryCount = arrayOfVotes.filter(x => x === countryCode).length
                        votes[countryCode] += countryCount
                    })
                })
                documentToWrite.votes = votes
                const saveCountryVotePromise = db.collection('countryVotes').doc(countryDoc.id).set(documentToWrite)
                countryVotePromises.push(saveCountryVotePromise)
                return Promise.all(countryVotePromises);
            })
            votePromises.push(votePromise)
        })
        return Promise.all(votePromises)
    }).then(function () {
        response.send("Successfully precessed votes")
    }).catch(function (error) {
        console.log(error)
        response.send(`Error ${error}`)
    })
})

app.get('/countryVotes', (request, response) => {
    db.collection('countryVotes').get().then((countryVotesDoc) => {
        const countryVotes: any[] = []
        var gobalVotecount = 0
        countryVotesDoc.forEach((doc) => {
            const countryVote = {
                country: doc.id,
                totalVotes: doc.data().totalVotes,
                votes: doc.data().votes
            }
            countryVotes.push(countryVote)
            gobalVotecount += countryVote.totalVotes
        })

        response.send({
            total: gobalVotecount,
            countryVotes: countryVotes
        })
    }).catch(function (error) {
        console.log("Error gettings countryVotes")
    })
})

app.get('/votesCount', (request, response) => {
    var i = 0
    db.collection('votes').select().get().then((snapshot) => {
        snapshot.forEach((doc) => {
            console.log(doc)
            i += 1
        })
        return i
    }).then(function (count) {
        response.send(count)
    })
        .catch(function (error) {
            response.send(error)
        })
})

// function countryCodeFromPhoneNumber(phoneNumber: String) {
//     type myMap = {
//         [key: string]: string
//     }
//     let prefixes: myMap = {
//         "355": "AL",
//         "374": "AM",
//         "43": "AT",
//         "61": "AU",
//         "994": "AZ",
//         "32": "BE",
//         "359": "BG",
//         "375": "BY",
//         "41": "CH",
//         "357": "CY",
//         "420": "CZ",
//         "49": "DE",
//         "45": "DK",
//         "372": "EE",
//         "34": "ES",
//         "358": "FI",
//         "33": "FR",
//         "44": "GB",
//         "995": "GE",
//         "30": "GR",
//         "385": "HR",
//         "36": "HU",
//         "353": "IE",
//         "972": "IL",
//         "354": "IS",
//         "39": "IT",
//         "370": "LT",
//         "371": "LV",
//         "373": "MD",
//         "389": "MK",
//         "356": "MT",
//         "31": "NL",
//         "47": "NO",
//         "48": "PL",
//         "351": "PT",
//         "40": "RO",
//         "381": "RS",
//         "7": "RU",
//         "46": "SE",
//         "386": "SI",
//         "378": "SM",
//         "380": "UA"
//     }
//     let oneDigitcode = phoneNumber.substring(1, 2)
//     if (prefixes[oneDigitcode] !== undefined) {
//         return prefixes[oneDigitcode]
//     }
//     let twoDigitcode = phoneNumber.substring(1, 3)
//     if (prefixes[twoDigitcode] !== undefined) {
//         return prefixes[twoDigitcode]
//     }
//     let threeDigitcode = phoneNumber.substring(1, 4)
//     return prefixes[threeDigitcode]
// }