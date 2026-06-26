#!/bin/bash
sudo sed -i 's|PHP_VERSION="7.4"|PHP_VERSION="8.4"|' /etc/mycontrolpanel/sites/tes.com.env
cat /etc/mycontrolpanel/sites/tes.com.env | head -6