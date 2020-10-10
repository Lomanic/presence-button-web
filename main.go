package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Status struct {
	FuzIsOpen      bool      `json:"fuzIsOpen"`
	LastSeenAsOpen bool      `json:"lastSeenAsOpen"`
	LastSeen       time.Time `json:"lastSeen"`
	LastOpened     time.Time `json:"lastOpened"`
	LastClosed     time.Time `json:"lastClosed"`
	ProcessUptime  string    `json:"processUptime"`
}

type Config struct {
	PORT                 string
	MATRIXROOM           string
	MATRIXOPENINGMESSAGE string
	MATRIXCLOSINGMESSAGE string
	MATRIXACCESSTOKEN    string
	MATRIXUSERNAME       string
	ESPUSERNAME          string
	ESPPASSWORD          string
}

const (
	dbPath                = "./.data/data.json"
	defaultClosingTimeout = 5 * time.Minute
)

var (
	status Status
	config = Config{
		PORT: "8080",
	}
	startTime = time.Now()
	imgs      = map[bool]string{
		// https://www.iconfinder.com/icons/1871431/online_open_shop_shopping_sign_icon
		// formerly https://www.flaticon.com/free-icon/open_1234189, maybe try https://flaticons.net/customize.php?dir=Miscellaneous&icon=Open.png without attribution
		true: `<?xml version="1.0" ?><svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><defs><style>.cls-1{fill:#5bc9e1;}.cls-2{fill:#fd0;}.cls-3{fill:#314967;}</style></defs><title/><g data-name="15 Open Sign" id="_15_Open_Sign"><rect class="cls-1" height="36" rx="6" ry="6" width="96" x="16" y="64"/><circle class="cls-2" cx="64" cy="28" r="6"/><path class="cls-3" d="M92.73,98H22a4,4,0,0,1-4-4V70a4,4,0,0,1,4-4H42.54a2,2,0,0,0,0-4H32.83L59.93,34.89a8,8,0,0,0,8.13,0L81.71,48.54a2,2,0,0,0,2.83-2.83L70.88,32.06A8,8,0,0,0,64,20a2,2,0,0,0,0,4,4,4,0,1,1-3.49,2,2,2,0,0,0-3.49-2,8,8,0,0,0,.09,8L27.17,62H22a8,8,0,0,0-8,8V94a8,8,0,0,0,8,8H92.73A2,2,0,0,0,92.73,98Z"/><path class="cls-3" d="M106,62h-5.17L88.09,49.26a2,2,0,0,0-2.83,2.83L95.17,62H76a2,2,0,0,0,0,4h30a4,4,0,0,1,4,4V94a4,4,0,0,1-4,4H98.51a2,2,0,0,0,0,4H106a8,8,0,0,0,8-8V70A8,8,0,0,0,106,62Z"/><path class="cls-3" d="M70,62H49.22a2,2,0,0,0,0,4H70A2,2,0,0,0,70,62Z"/><path class="cls-3" d="M54.86,73.62a2.2,2.2,0,0,0-2.19,2.19v12.8a2.2,2.2,0,0,0,4.41,0V84.91h1.67a5.64,5.64,0,1,0,0-11.29ZM60,79.27c0,1.49-1.64,1.23-2.93,1.23V78C58.42,78,60,77.78,60,79.27Z"/><path class="cls-3" d="M77,78c2.86,0,2.93-4.41,0-4.41H69.92a2.17,2.17,0,0,0-2.19,2.19v12.8a2.2,2.2,0,0,0,1.25,2v.21h8c2.91,0,2.87-4.41,0-4.41H72.13v-2h4.06a2.2,2.2,0,0,0,0-4.41H72.13V78Z"/><path class="cls-3" d="M96.63,76c0-2.83-4.37-2.9-4.37,0v5.85l-5.19-7.19A2.18,2.18,0,0,0,83.13,76V88.62a2.18,2.18,0,0,0,4.37,0V82.71l5.1,7.08a2.19,2.19,0,0,0,4-1.17Z"/><path class="cls-3" d="M39.84,73.19a8.82,8.82,0,0,0,0,17.62A8.69,8.69,0,0,0,48.22,82C48.22,77.31,44.49,73.19,39.84,73.19Zm0,13.15c-5.3,0-5.26-8.68,0-8.68a4.36,4.36,0,0,1,0,8.68Z"/></g></svg>`,
		// https://www.iconfinder.com/icons/1871435/closed_online_shop_shopping_sign_icon
		// formerly https://www.flaticon.com/free-icon/closed_1234190, maybe try https://flaticons.net/customize.php?dir=Miscellaneous&icon=Closed.png without attribution
		false: `<?xml version="1.0" ?><svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><defs><style>.cls-1{fill:#f8991d;}.cls-2{fill:#fd0;}.cls-3{fill:#314967;}</style></defs><title/><g data-name="18 Closed Sign" id="_18_Closed_Sign"><rect class="cls-1" height="36" rx="6" ry="6" width="96" x="16" y="64"/><circle class="cls-2" cx="64" cy="28" r="6"/><path class="cls-3" d="M71.85,77.83a4.37,4.37,0,0,1,2.34,1,1.93,1.93,0,1,0,2.08-3.25A7.94,7.94,0,0,0,71.85,74c-3.13,0-5.55,2.06-5.55,4.58,0,2.74,2.64,4.21,5.35,4.58.55.11,2,.45,2.26,1,0,.57-1.38,1-2,1a5.25,5.25,0,0,1-2.79-1.16,1.93,1.93,0,1,0-2.42,3,8.73,8.73,0,0,0,5.23,2c3.12,0,5.88-2,5.88-4.82s-2.88-4.4-5.66-4.78c-1.6-.31-2-.77-2-.77C70.15,78.39,70.8,77.83,71.85,77.83Z"/><path class="cls-3" d="M40,76.34V87a2,2,0,0,0,2,2h5.83a2,2,0,0,0,0-4H44V76.34A2,2,0,0,0,40,76.34Z"/><path class="cls-3" d="M50,81.48A7.16,7.16,0,1,0,57.23,74,7.32,7.32,0,0,0,50,81.48Zm10.26,0c0,2.89-3.21,4.64-5.27,2.43-1.94-2-.71-5.86,2.2-5.86A3.29,3.29,0,0,1,60.3,81.48Z"/><path class="cls-3" d="M34.44,78.82a2,2,0,0,0,2.49-3.21A7.7,7.7,0,0,0,32.15,74a7.6,7.6,0,0,0-7.6,7.48h0c0,6.3,7.44,9.7,12.39,5.86a2,2,0,0,0-2.51-3.2,3.52,3.52,0,1,1,0-5.31Z"/><path class="cls-3" d="M87.69,78.35a2,2,0,0,0,0-4H81.8a2,2,0,0,0-2,2V87a2,2,0,0,0,1,1.75V89h6.83a2,2,0,0,0,0-4H83.81V83.65H87a2,2,0,0,0,0-4h-3.2V78.35Z"/><path class="cls-3" d="M103.09,81.64a7.29,7.29,0,0,0-7.28-7.28H93.69a2,2,0,0,0-2,2V87a2,2,0,0,0,2,2h2.13A7.31,7.31,0,0,0,103.09,81.64ZM95.81,85h-.12V78.35h.12C100.14,78.35,100.18,84.93,95.81,85Z"/><path class="cls-3" d="M92.73,98H22a4,4,0,0,1-4-4V70a4,4,0,0,1,4-4H42.55a2,2,0,0,0,0-4H32.83L59.93,34.89a8,8,0,0,0,8.13,0L81.71,48.54a2,2,0,0,0,2.83-2.83L70.88,32.06A8,8,0,0,0,64,20a2,2,0,0,0,0,4,4,4,0,0,1,2.79,6.86C63.58,34,58.24,30.08,60.51,26a2,2,0,0,0-3.49-2,8,8,0,0,0,.09,8L27.17,62H22a8,8,0,0,0-8,8V94a8,8,0,0,0,8,8H92.73A2,2,0,0,0,92.73,98Z"/><path class="cls-3" d="M106,62h-5.17L88.09,49.26a2,2,0,0,0-2.83,2.83L95.17,62H76a2,2,0,0,0,0,4h30a4,4,0,0,1,4,4V94a4,4,0,0,1-4,4H98.51a2,2,0,0,0,0,4H106a8,8,0,0,0,8-8V70A8,8,0,0,0,106,62Z"/><path class="cls-3" d="M70,62H49.22a2,2,0,0,0,0,4H70A2,2,0,0,0,70,62Z"/></g></svg>`,
	}
	db *os.File
)

func init() {
	port := os.Getenv("PORT")
	if val, _ := strconv.Atoi(port); val > 0 {
		config.PORT = port
	}
	config.MATRIXROOM = os.Getenv("MATRIXROOM")
	config.MATRIXOPENINGMESSAGE = os.Getenv("MATRIXOPENINGMESSAGE")
	config.MATRIXCLOSINGMESSAGE = os.Getenv("MATRIXCLOSINGMESSAGE")
	config.MATRIXACCESSTOKEN = os.Getenv("MATRIXACCESSTOKEN")
	config.MATRIXUSERNAME = os.Getenv("MATRIXUSERNAME")
	config.ESPUSERNAME = os.Getenv("ESPUSERNAME")
	config.ESPPASSWORD = os.Getenv("ESPPASSWORD")

	if config.MATRIXROOM == "" {
		panic("MATRIXROOM is empty")
	}
	if config.MATRIXOPENINGMESSAGE == "" {
		panic("MATRIXOPENINGMESSAGE is empty")
	}
	if config.MATRIXCLOSINGMESSAGE == "" {
		panic("MATRIXCLOSINGMESSAGE is empty")
	}
	if config.MATRIXACCESSTOKEN == "" {
		panic("MATRIXACCESSTOKEN is empty")
	}
	if config.MATRIXUSERNAME == "" {
		panic("MATRIXUSERNAME is empty")
	}
	if config.ESPPASSWORD == "" {
		panic("ESPPASSWORD is empty")
	}

	err := os.MkdirAll(filepath.Dir(dbPath), 0755)
	if err != nil {
		panic(err)
	}
	db, err = os.OpenFile(dbPath, os.O_RDWR|os.O_CREATE, 0600)
	if err != nil && !os.IsNotExist(err) {
		panic(err)
	}
	d := json.NewDecoder(db)
	d.Decode(&status)
	if err != nil {
		fmt.Println("error unmarshalling db:", err)
	}
}

func updateUptime() {
	for range time.Tick(time.Second) {
		status.ProcessUptime = time.Since(startTime).Truncate(time.Second).String()
	}
}

func checkClosure() {
	time.Sleep(time.Minute) // give some time for presence button to show up
	for {
		if status.LastSeen.Add(defaultClosingTimeout).Before(time.Now()) && status.LastClosed.Before(status.LastSeen) {
			// the Fuz is newly closed, notify on matrix and write file to survive reboot
			// TODO: matrix msg
			fmt.Println("the Fuz is newly closed, notify on matrix and write file to survive reboot")
			err := sendMatrixMessage(config.MATRIXUSERNAME, config.MATRIXACCESSTOKEN, config.MATRIXROOM, config.MATRIXCLOSINGMESSAGE)
			if err != nil {
				fmt.Println("err:", err)
				time.Sleep(10 * time.Second)
				continue
			}

			status.LastClosed = time.Now()
			status.FuzIsOpen = false
			db.Truncate(0)
			db.Seek(0, 0)
			e := json.NewEncoder(db)
			e.SetIndent("", "    ")
			e.Encode(status)
		}
		time.Sleep(10 * time.Second)
	}
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	fmt.Fprintf(w, `Fuz presence button public API

This API provides the current opening status of the hackerspace. This server also posts messages on Matrix to notify when the space opens and closes.

Usage:

/         Shows help
/api      Serves some JSON with lax CORS headers to get the current opening status programatically. The properties are the following:
            * fuzIsOpen: (boolean) reflects if the space is currently open
            * lastSeenAsOpen: (boolean) reflects if the last ping by the ESP was after being pushed (space officially opened)
            * lastSeen: (date) last ESP ping timestamp
            * lastOpened: (date) last space opening timestamp
            * lastClosed: (date) last space closing timestamp
            * processUptime: (duration) API process uptime
/img      Serves an svg image showing if the space is open or closed.
/status   Private endpoint used by the ESP (physical button) to regularly ping/update the opening status.


Source code:        https://github.com/Lomanic/presence-button-web
Source code mirror: https://git.interhacker.space/Lomanic/presence-button-web
Documentation:      https://wiki.fuz.re/doku.php?id=projets:fuz:presence_button`)
}

func apiHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
	e := json.NewEncoder(w)
	e.SetIndent("", "    ")
	e.Encode(status)
}

func imgHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	fmt.Fprintf(w, imgs[status.FuzIsOpen])
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	user, pass, ok := r.BasicAuth()
	fmt.Println("user", user, "pass", pass, "ok", ok)
	if !ok || user != config.ESPUSERNAME || pass != config.ESPPASSWORD {
		w.Header().Set("WWW-Authenticate", `Basic realm="Authentication required"`)
		http.Error(w, "Authentication required", 401)
		return
	}
	q := r.URL.Query()
	status.FuzIsOpen = q.Get("fuzisopen") == "1"
	status.LastSeenAsOpen = q.Get("fuzisopen") == "1"
	status.LastSeen = time.Now()
	fmt.Fprintf(w, "OK")

	db.Truncate(0)
	db.Seek(0, 0)
	e := json.NewEncoder(db)
	e.SetIndent("", "    ")
	e.Encode(status)
	if status.FuzIsOpen && (status.LastOpened.Equal(status.LastClosed) || status.LastOpened.Before(status.LastClosed)) {
		// the Fuz is newly opened, notify on matrix and write file to survive reboot
		fmt.Println("the Fuz is newly opened, notify on matrix and write file to survive reboot")
		err := sendMatrixMessage(config.MATRIXUSERNAME, config.MATRIXACCESSTOKEN, config.MATRIXROOM, config.MATRIXOPENINGMESSAGE)
		if err != nil {
			fmt.Println("err:", err)
			return
		}

		status.LastOpened = time.Now()
		db.Truncate(0)
		db.Seek(0, 0)
		e := json.NewEncoder(db)
		e.SetIndent("", "    ")
		e.Encode(status)
	}
}

func sendMatrixMessage(username, accessToken, room, messageText string) error {
	type Message struct {
		Msgtype string `json:"msgtype"`
		Body    string `json:"body"`
	}
	client := &http.Client{}
	message := Message{
		Msgtype: "m.text",
		Body:    messageText,
	}
	body := new(bytes.Buffer)
	err := json.NewEncoder(body).Encode(message)
	if err != nil {
		return err
	}
	v := url.Values{}
	v.Set("access_token", accessToken)
	v.Set("limit", "1")
	url := url.URL{
		Scheme:   "https",
		Host:     username[strings.Index(username, ":")+1:],
		Path:     fmt.Sprintf("/_matrix/client/r0/rooms/%s/send/m.room.message/%d", room, time.Now().UnixNano()/1000000),
		RawQuery: v.Encode(),
	}
	req, err := http.NewRequest(http.MethodPut, url.String(), body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	resBody, _ := ioutil.ReadAll(res.Body)
	fmt.Println(string(resBody))

	return nil
}

func main() {
	go updateUptime()
	go checkClosure()
	http.HandleFunc("/", rootHandler)
	http.HandleFunc("/api", apiHandler)
	http.HandleFunc("/img", imgHandler)
	http.HandleFunc("/status", statusHandler)
	log.Fatal(http.ListenAndServe(":"+config.PORT, nil))
}
