#ifndef DAILY_GK_H
#define DAILY_GK_H

#include "vmsys.h"
#include "vmio.h"
#include "vmgraph.h"
#include "vmchset.h"
#include "vmstdlib.h"
#include "vmtcp.h"
#include "vmsock.h"
#include "vminput.h"
#include "vmtimer.h"

#define SCREEN_WIDTH        240
#define SCREEN_HEIGHT       320
#define MAX_QUESTIONS       30
#define MAX_OPTIONS         4
#define HTTP_BUF_SIZE       16384


typedef enum {
    STATE_FETCHING,
    STATE_QUESTION,
    STATE_FEEDBACK,
    STATE_SCORECARD,
    STATE_ERROR
} AppState;


typedef struct {
    char question[256];
    char options[MAX_OPTIONS][96];
    int  correct_index;
    char category[32];
} GKQuestion;


typedef struct {
    AppState    state;
    VMINT       layer_handle;
    VMINT       tcp_handle;
    char        recv_buf[HTTP_BUF_SIZE];
    int         recv_len;
    
    GKQuestion  questions[MAX_QUESTIONS];
    int         total_questions;
    int         current_q;
    int         selected_option;
    int         user_choice;
    int         score;
    
    VMWCHAR     ucs2_str[512];
    char        status_msg[64];
} AppContext;

void app_init(void);
void fetch_realtime_data(void);
void parse_json_data(const char* json);
void draw_screen(void);
void load_fallback_data(void);

#endif 