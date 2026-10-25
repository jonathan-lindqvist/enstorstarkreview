package se.enstorstarkreview.app.model

import java.util.Collections
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.RecordedRequest
import okhttp3.Headers.Companion.headersOf

/** Answers by method and path (without `/api/v1`), and records each request. */
class Routes : Dispatcher() {
    private val routes = Collections.synchronizedMap(mutableMapOf<String, MutableList<MockResponse>>())
    val sent: MutableList<RecordedRequest> = Collections.synchronizedList(mutableListOf())

    /** Queues [response] for `METHOD /path`; the last one repeats. */
    fun on(route: String, response: MockResponse) {
        routes.getOrPut(route) { mutableListOf() } += response
    }

    fun json(route: String, body: String, code: Int = 200, vararg headers: String) =
        on(route, MockResponse.Builder().code(code).headers(headersOf("Content-Type", "application/json", *headers)).body(body).build())

    fun problem(route: String, code: Int, problemCode: String, detail: String = "Fel", errors: String = "") =
        on(route, MockResponse.Builder().code(code).headers(headersOf("Content-Type", "application/problem+json"))
            .body("""{"type":"about:blank","title":"Fel","status":$code,"code":"$problemCode","detail":"$detail"$errors}""").build())

    fun count(route: String) = sent.count { key(it) == route }

    private fun key(request: RecordedRequest) = "${request.method} ${request.url.encodedPath.removePrefix("/api/v1")}"

    override fun dispatch(request: RecordedRequest): MockResponse {
        sent += request
        val queue = routes[key(request)] ?: return MockResponse.Builder().code(599).build()
        return if (queue.size > 1) queue.removeAt(0) else queue.first()
    }
}
