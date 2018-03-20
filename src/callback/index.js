import IsNil from 'lodash-es/isNil';
import QueryString from 'querystring';
import Runtime from 'wes/runtime';
import URI from 'urijs';

import FrameworkPlugin from 'neon-extension-framework/core/plugin';

import Plugin from '../core/plugin';


(function() {
    let communicationTimeout;

    let $status = document.querySelector('.status');
    let $title = document.querySelector('.title');
    let $description = document.querySelector('.description');

    function updateStatus(status, {title, description}) {
        // Update status classes
        if(!$status.classList.contains(status)) {
            $status.classList.remove('success', 'error');
            $status.classList.add(status);
        }

        // Update message title
        if(!IsNil(title)) {
            $title.textContent = title;
        } else {
            $title.textContent = '';
        }

        // Update message description
        if(!IsNil(description)) {
            $description.textContent = description;
        } else {
            $description.textContent = '';
        }
    }

    function onSuccess() {
        // Clear the communication timeout handler
        if(!IsNil(communicationTimeout)) {
            clearTimeout(communicationTimeout);
        }

        // Display completion message
        updateStatus('success', {
            'title': 'Authentication complete',
            'description': 'You may now close this page.'
        });
    }

    function onError(error) {
        // Display error
        updateStatus('error', error);
    }

    function onTimeout() {
        onError({
            title: 'Unable to communicate with the configuration page',
            description: 'Please ensure you don\'t close the configuration page during the authentication process.'
        });
    }

    function process() {
        let messaging = Plugin.messaging.service('authentication');

        // Bind events
        messaging.once('success', onSuccess);
        messaging.once('error', onError);

        // Ensure search parameters exist
        if(window.location.search.length < 2) {
            onError({
                title: 'Invalid callback parameters',
                description: 'No parameters were found.'
            });
            return;
        }

        // Decode query parameters
        let query = QueryString.decode(
            window.location.search.substring(1)
        );

        // Ensure token is defined
        if(IsNil(query.code)) {
            onError({
                title: 'Invalid callback parameters',
                description: 'No "code" parameter was found.'
            });
            return;
        }

        // Emit authentication token
        messaging.emit('callback', query);

        // Display communication error if no response is returned in 5 seconds
        communicationTimeout = setTimeout(onTimeout, 5000);
    }

    function refresh() {
        let url = new URI(location.href);

        // Ensure page hasn't already been refreshed
        if(url.hasQuery('refreshed', true)) {
            onError({
                title: 'Invalid state',
                description: 'No extension identifier available.'
            });
            return;
        }

        // Refresh page (and add the "refreshed" parameter to the url)
        window.location.replace(url.addQuery('refreshed').toString());
    }

    // Update page title
    document.title = `${Plugin.title} Authentication - ${FrameworkPlugin.title}`;

    // Refresh page if the extension identifier is not available
    if(IsNil(Runtime.id)) {
        refresh();
        return;
    }

    // Process callback
    process();
})();
